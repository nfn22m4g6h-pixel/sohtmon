-- SOHTMON ERP: обновление базы 1.0 → 2.0-a (поставщики, долги поставщикам, полная себестоимость).
-- Supabase → SQL Editor → New query → вставить весь файл → Run. Запускать ОДИН раз.
-- Существующие данные не изменяются и не удаляются.

-- SOHTMON ERP 2.0-a — поставщики, долги поставщикам, полная себестоимость прихода.
-- Только добавляет новое: существующие данные не изменяются.

alter type public.cash_source add value if not exists 'supplier_payment';

-- ---------------------------------------------------------------------------
-- Поставщики
-- ---------------------------------------------------------------------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  phone text,
  country text,
  note text,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index suppliers_name_key on public.suppliers (lower(name));

alter table public.stock_arrivals
  add column supplier_id uuid references public.suppliers (id) on delete restrict,
  add column extra_costs_tjs numeric(14, 2) not null default 0;
create index stock_arrivals_supplier_idx on public.stock_arrivals (supplier_id);

-- Себестоимость единицы с учётом доставки/таможни (TJS)
alter table public.stock_arrival_items add column landed_unit_cost_tjs numeric(14, 4);

-- Дополнительные расходы прихода (доставка, таможня…) — входят в себестоимость, не в «Расходы»
create table public.stock_arrival_costs (
  id uuid primary key default gen_random_uuid(),
  arrival_id uuid not null references public.stock_arrivals (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  amount numeric(14, 2) not null check (amount > 0),
  currency public.currency_code not null,
  rate numeric(14, 4) not null check (rate > 0),
  paid_from_cash boolean not null default false
);
create index stock_arrival_costs_arrival_idx on public.stock_arrival_costs (arrival_id);

-- Оплаты поставщикам
create table public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  arrival_id uuid references public.stock_arrivals (id) on delete set null,
  currency public.currency_code not null,
  amount numeric(14, 2) not null check (amount > 0),
  method public.payment_method not null default 'cash',
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index supplier_payments_supplier_idx on public.supplier_payments (supplier_id, created_at desc);

-- Наш долг поставщику по валютам: приходы − оплаты
create view public.supplier_balances with (security_invoker = true) as
with debts as (
  select supplier_id, currency, sum(total) as amount
    from public.stock_arrivals
   where supplier_id is not null
   group by 1, 2
),
pays as (
  select supplier_id, currency, sum(amount) as amount
    from public.supplier_payments
   group by 1, 2
)
select coalesce(d.supplier_id, p.supplier_id) as supplier_id,
       coalesce(d.currency, p.currency) as currency,
       coalesce(d.amount, 0) as total_purchased,
       coalesce(p.amount, 0) as total_paid,
       coalesce(d.amount, 0) - coalesce(p.amount, 0) as balance
  from debts d
  full join pays p on p.supplier_id = d.supplier_id and p.currency = d.currency;

-- ---------------------------------------------------------------------------
-- Приход 2.0: поставщик, частичная оплата, доп. расходы → полная себестоимость
-- p_items: [{"product_id", "qty", "cost"}]                       cost — в валюте прихода
-- p_extra_costs: [{"name", "amount", "currency", "paid_from_cash"}]
-- ---------------------------------------------------------------------------
drop function if exists public.create_arrival(jsonb, public.currency_code, text, boolean, text);

create or replace function public.create_arrival(
  p_items jsonb,
  p_currency public.currency_code default 'CNY',
  p_supplier_id uuid default null,
  p_paid numeric default null,
  p_paid_method public.payment_method default 'cash',
  p_extra_costs jsonb default '[]'::jsonb,
  p_note text default null,
  p_supplier_name text default null
)
returns public.stock_arrivals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_arrival public.stock_arrivals;
  v_rate numeric := public.currency_rate(p_currency);
  v_item jsonb;
  v_cost_item jsonb;
  v_product public.products;
  v_qty numeric;
  v_cost numeric;
  v_base numeric;
  v_total numeric := 0;
  v_value_tjs numeric := 0;
  v_qty_total numeric := 0;
  v_extra_tjs numeric := 0;
  v_share numeric;
  v_landed numeric;
  v_paid numeric;
  v_supplier_name text;
  v_c_amount numeric;
  v_c_cur public.currency_code;
begin
  perform public.require_role('owner', 'admin', 'manager', 'warehouse');

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Добавьте хотя бы один товар' using errcode = '22023';
  end if;
  if p_supplier_id is not null then
    select name into v_supplier_name from public.suppliers where id = p_supplier_id;
    if not found then
      raise exception 'Поставщик не найден' using errcode = 'P0002';
    end if;
  end if;

  -- Проверка строк и итог
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'qty')::numeric;
    v_cost := round(coalesce((v_item ->> 'cost')::numeric, 0), 2);
    if v_qty is null or v_qty <= 0 then
      raise exception 'Количество должно быть больше нуля' using errcode = '22023';
    end if;
    if v_cost < 0 then
      raise exception 'Цена закупки не может быть отрицательной' using errcode = '22023';
    end if;
    if not exists (select 1 from public.products where id = (v_item ->> 'product_id')::uuid) then
      raise exception 'Товар не найден' using errcode = 'P0002';
    end if;
    v_total := v_total + round(v_qty * v_cost, 2);
    v_value_tjs := v_value_tjs + v_qty * v_cost * v_rate;
    v_qty_total := v_qty_total + v_qty;
  end loop;

  -- Доп. расходы
  if p_extra_costs is not null and jsonb_typeof(p_extra_costs) = 'array' then
    for v_cost_item in select * from jsonb_array_elements(p_extra_costs) loop
      v_c_amount := round(coalesce((v_cost_item ->> 'amount')::numeric, 0), 2);
      if v_c_amount < 0 then
        raise exception 'Сумма доп. расхода не может быть отрицательной' using errcode = '22023';
      end if;
      if v_c_amount > 0 then
        v_c_cur := coalesce(nullif(v_cost_item ->> 'currency', ''), 'TJS')::public.currency_code;
        v_extra_tjs := v_extra_tjs + v_c_amount * public.currency_rate(v_c_cur);
      end if;
    end loop;
  end if;

  v_paid := round(coalesce(p_paid, case when p_supplier_id is null then v_total else 0 end), 2);
  if v_paid < 0 or v_paid > v_total then
    raise exception 'Оплата поставщику должна быть от 0 до %', v_total using errcode = '22023';
  end if;
  if v_paid < v_total and p_supplier_id is null then
    raise exception 'Чтобы записать долг поставщику, выберите поставщика' using errcode = '22023';
  end if;

  insert into public.stock_arrivals (supplier, supplier_id, currency, rate, total, paid_from_cash, extra_costs_tjs, note, created_by)
  values (coalesce(v_supplier_name, nullif(trim(p_supplier_name), '')), p_supplier_id, p_currency, v_rate, v_total,
          v_paid > 0 and p_paid_method = 'cash', round(v_extra_tjs, 2), nullif(trim(p_note), ''), auth.uid())
  returning * into v_arrival;

  -- Строки: себестоимость = цена × курс + доля доп. расходов (пропорционально стоимости)
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'qty')::numeric;
    v_cost := round(coalesce((v_item ->> 'cost')::numeric, 0), 2);
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid for update;

    v_share := case
      when v_extra_tjs = 0 then 0
      when v_value_tjs > 0 then v_extra_tjs * (v_qty * v_cost * v_rate) / v_value_tjs
      else v_extra_tjs * v_qty / v_qty_total
    end;
    v_landed := v_cost * v_rate + v_share / v_qty;

    v_base := greatest(v_product.stock, 0);
    update public.products
       set avg_cost_tjs = round((v_base * avg_cost_tjs + v_qty * v_landed) / (v_base + v_qty), 4),
           purchase_price = v_cost,
           purchase_currency = p_currency
     where id = v_product.id;

    insert into public.stock_arrival_items (arrival_id, product_id, qty, cost, total, landed_unit_cost_tjs)
    values (v_arrival.id, v_product.id, v_qty, v_cost, round(v_qty * v_cost, 2), round(v_landed, 4));
    perform public._apply_stock(v_product.id, v_qty, 'arrival', v_arrival.id);
  end loop;

  -- Доп. расходы: запись и (при необходимости) выдача из кассы
  if p_extra_costs is not null and jsonb_typeof(p_extra_costs) = 'array' then
    for v_cost_item in select * from jsonb_array_elements(p_extra_costs) loop
      v_c_amount := round(coalesce((v_cost_item ->> 'amount')::numeric, 0), 2);
      continue when v_c_amount <= 0;
      v_c_cur := coalesce(nullif(v_cost_item ->> 'currency', ''), 'TJS')::public.currency_code;
      insert into public.stock_arrival_costs (arrival_id, name, amount, currency, rate, paid_from_cash)
      values (v_arrival.id, coalesce(nullif(trim(v_cost_item ->> 'name'), ''), 'Доп. расход'), v_c_amount, v_c_cur,
              public.currency_rate(v_c_cur), coalesce((v_cost_item ->> 'paid_from_cash')::boolean, false));
      if coalesce((v_cost_item ->> 'paid_from_cash')::boolean, false) then
        perform public._cash('out', 'arrival', v_c_cur, v_c_amount, v_arrival.id,
          coalesce(nullif(trim(v_cost_item ->> 'name'), ''), 'Доп. расход') || ' · приход №' || v_arrival.number);
      end if;
    end loop;
  end if;

  -- Оплата поставщику при приходе
  if v_paid > 0 then
    if p_supplier_id is not null then
      insert into public.supplier_payments (supplier_id, arrival_id, currency, amount, method, note, created_by)
      values (p_supplier_id, v_arrival.id, p_currency, v_paid, p_paid_method, 'Оплата при приходе №' || v_arrival.number, auth.uid());
    end if;
    if p_paid_method = 'cash' then
      perform public._cash('out', case when p_supplier_id is null then 'arrival' else 'supplier_payment' end::public.cash_source,
        p_currency, v_paid, v_arrival.id,
        'Приход №' || v_arrival.number || coalesce(' · ' || v_supplier_name, ''));
    end if;
  end if;

  return v_arrival;
end;
$$;

-- ---------------------------------------------------------------------------
-- Оплата поставщику (погашение нашего долга)
-- ---------------------------------------------------------------------------
create or replace function public.add_supplier_payment(
  p_supplier_id uuid,
  p_amount numeric,
  p_currency public.currency_code default 'CNY',
  p_method public.payment_method default 'cash',
  p_note text default null
)
returns public.supplier_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.supplier_payments;
  v_name text;
begin
  perform public.require_role('owner', 'admin', 'manager');
  if p_amount is null or p_amount <= 0 then
    raise exception 'Сумма должна быть больше нуля' using errcode = '22023';
  end if;
  select name into v_name from public.suppliers where id = p_supplier_id;
  if not found then
    raise exception 'Поставщик не найден' using errcode = 'P0002';
  end if;

  insert into public.supplier_payments (supplier_id, currency, amount, method, note, created_by)
  values (p_supplier_id, p_currency, round(p_amount, 2), p_method, nullif(trim(p_note), ''), auth.uid())
  returning * into v_payment;

  if p_method = 'cash' then
    perform public._cash('out', 'supplier_payment', p_currency, v_payment.amount, v_payment.id, 'Оплата поставщику: ' || v_name);
  end if;
  return v_payment;
end;
$$;

-- ---------------------------------------------------------------------------
-- Права и RLS
-- ---------------------------------------------------------------------------
revoke all on public.suppliers, public.stock_arrival_costs, public.supplier_payments, public.supplier_balances from anon, authenticated;
grant select on public.suppliers, public.stock_arrival_costs, public.supplier_payments, public.supplier_balances to authenticated;
grant insert (name, phone, country, note), update (name, phone, country, note), delete on public.suppliers to authenticated;

revoke execute on function public.create_arrival(jsonb, public.currency_code, uuid, numeric, public.payment_method, jsonb, text, text) from public, anon;
revoke execute on function public.add_supplier_payment(uuid, numeric, public.currency_code, public.payment_method, text) from public, anon;
grant execute on function
  public.create_arrival(jsonb, public.currency_code, uuid, numeric, public.payment_method, jsonb, text, text),
  public.add_supplier_payment(uuid, numeric, public.currency_code, public.payment_method, text)
to authenticated;

alter table public.suppliers enable row level security;
alter table public.stock_arrival_costs enable row level security;
alter table public.supplier_payments enable row level security;

create policy suppliers_select on public.suppliers for select to authenticated
  using (public.has_role('owner', 'admin', 'manager', 'warehouse'));
create policy suppliers_insert on public.suppliers for insert to authenticated
  with check (public.has_role('owner', 'admin', 'manager', 'warehouse'));
create policy suppliers_update on public.suppliers for update to authenticated
  using (public.has_role('owner', 'admin', 'manager', 'warehouse'))
  with check (public.has_role('owner', 'admin', 'manager', 'warehouse'));
create policy suppliers_delete on public.suppliers for delete to authenticated
  using (public.has_role('owner', 'admin'));

create policy stock_arrival_costs_select on public.stock_arrival_costs for select to authenticated
  using (public.has_role('owner', 'admin', 'manager', 'warehouse'));

-- Деньги поставщикам видят только owner/admin/manager
create policy supplier_payments_select on public.supplier_payments for select to authenticated
  using (public.has_role('owner', 'admin', 'manager'));
