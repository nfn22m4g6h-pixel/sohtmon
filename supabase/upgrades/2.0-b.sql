-- SOHTMON ERP: обновление базы 2.0-a → 2.0-b (частичный возврат по чеку, смены кассира).
-- Supabase → SQL Editor → New query → вставить весь файл → Run. Запускать ОДИН раз, после 2.0-a.
-- Существующие данные не изменяются и не удаляются.

-- SOHTMON ERP 2.0-b — частичный возврат по чеку и смены кассира.
-- Только добавляет новое; обновляет отчёты (учёт возвратов), отмену продажи и вид долгов клиентов.

alter type public.movement_type add value if not exists 'sale_return';
alter type public.cash_source add value if not exists 'sale_return';
alter type public.cash_source add value if not exists 'shift_diff';

-- ---------------------------------------------------------------------------
-- Возвраты
-- ---------------------------------------------------------------------------
create table public.sale_returns (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  sale_id uuid not null references public.sales (id) on delete restrict,
  currency public.currency_code not null,
  rate numeric(14, 4) not null check (rate > 0),
  total numeric(14, 2) not null check (total >= 0),          -- стоимость возврата (с учётом скидки чека)
  debt_reduction numeric(14, 2) not null default 0 check (debt_reduction >= 0),
  refund_amount numeric(14, 2) not null default 0 check (refund_amount >= 0),
  refund_method public.payment_method not null default 'cash',
  reason text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (debt_reduction + refund_amount = total)
);
create index sale_returns_sale_idx on public.sale_returns (sale_id);
create index sale_returns_created_at_idx on public.sale_returns (created_at desc);

create table public.sale_return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.sale_returns (id) on delete cascade,
  sale_item_id uuid not null references public.sale_items (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  qty numeric(14, 3) not null check (qty > 0),
  price numeric(14, 2) not null,
  total numeric(14, 2) not null,
  cost_tjs numeric(14, 4) not null default 0
);
create index sale_return_items_return_idx on public.sale_return_items (return_id);
create index sale_return_items_sale_item_idx on public.sale_return_items (sale_item_id);

-- p_items: [{"sale_item_id": uuid, "qty": number}]
create or replace function public.return_sale_items(
  p_sale_id uuid,
  p_items jsonb,
  p_refund_method public.payment_method default 'cash',
  p_reason text default null
)
returns public.sale_returns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales;
  v_ret public.sale_returns;
  v_item jsonb;
  v_si public.sale_items;
  v_qty numeric;
  v_returned numeric;
  v_factor numeric;
  v_line numeric;
  v_total numeric := 0;
  v_debt_left numeric;
  v_debt_red numeric;
begin
  perform public.require_role('owner', 'admin', 'manager');

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then
    raise exception 'Продажа не найдена' using errcode = 'P0002';
  end if;
  if v_sale.status <> 'completed' then
    raise exception 'Продажа отменена — возврат невозможен' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Выберите товары для возврата' using errcode = '22023';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'Укажите причину возврата' using errcode = '22023';
  end if;

  -- Доля чека после скидки
  v_factor := case when v_sale.subtotal > 0 then v_sale.total / v_sale.subtotal else 0 end;

  insert into public.sale_returns (sale_id, currency, rate, total, refund_method, reason, created_by)
  values (p_sale_id, v_sale.currency, v_sale.rate, 0, p_refund_method, trim(p_reason), auth.uid())
  returning * into v_ret;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'qty')::numeric;
    continue when v_qty is null or v_qty = 0;
    if v_qty < 0 then
      raise exception 'Количество возврата не может быть отрицательным' using errcode = '22023';
    end if;
    select * into v_si from public.sale_items where id = (v_item ->> 'sale_item_id')::uuid and sale_id = p_sale_id;
    if not found then
      raise exception 'Строка чека не найдена' using errcode = 'P0002';
    end if;
    select coalesce(sum(qty), 0) into v_returned from public.sale_return_items where sale_item_id = v_si.id;
    if v_qty > v_si.qty - v_returned then
      raise exception 'Нельзя вернуть больше, чем продано: «%» доступно %', v_si.product_name, v_si.qty - v_returned using errcode = '22023';
    end if;
    v_line := round(v_qty * v_si.price * v_factor, 2);
    insert into public.sale_return_items (return_id, sale_item_id, product_id, qty, price, total, cost_tjs)
    values (v_ret.id, v_si.id, v_si.product_id, v_qty, v_si.price, v_line, v_si.cost_tjs);
    perform public._apply_stock(v_si.product_id, v_qty, 'sale_return', v_ret.id, true);
    v_total := v_total + v_line;
  end loop;

  if v_total = 0 and not exists (select 1 from public.sale_return_items where return_id = v_ret.id) then
    raise exception 'Выберите товары для возврата' using errcode = '22023';
  end if;

  -- Сначала уменьшаем долг по этому чеку, остаток — возврат денег
  select v_sale.debt - coalesce(sum(debt_reduction), 0) into v_debt_left
    from public.sale_returns where sale_id = p_sale_id and id <> v_ret.id;
  v_debt_red := least(greatest(v_debt_left, 0), v_total);

  update public.sale_returns
     set total = v_total, debt_reduction = v_debt_red, refund_amount = v_total - v_debt_red
   where id = v_ret.id
  returning * into v_ret;

  if p_refund_method = 'cash' and v_ret.refund_amount > 0 then
    perform public._cash('out', 'sale_return', v_sale.currency, v_ret.refund_amount, v_ret.id,
      'Возврат №' || v_ret.number || ' по чеку №' || v_sale.number);
  end if;
  return v_ret;
end;
$$;

-- Отмена продажи: запрещена, если по чеку уже были возвраты (иначе двойной возврат)
create or replace function public.cancel_sale(p_sale_id uuid, p_reason text default null)
returns public.sales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales;
  v_item public.sale_items;
begin
  perform public.require_role('owner', 'admin');

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then
    raise exception 'Продажа не найдена' using errcode = 'P0002';
  end if;
  if v_sale.status = 'cancelled' then
    raise exception 'Продажа уже отменена' using errcode = '22023';
  end if;
  if exists (select 1 from public.sale_returns where sale_id = p_sale_id) then
    raise exception 'По чеку уже есть возврат — оформите возврат оставшихся товаров вместо отмены' using errcode = '22023';
  end if;

  for v_item in select * from public.sale_items where sale_id = p_sale_id loop
    perform public._apply_stock(v_item.product_id, v_item.qty, 'sale_cancel', p_sale_id, true);
  end loop;

  if v_sale.payment_method = 'cash' then
    perform public._cash('out', 'sale_cancel', v_sale.currency, v_sale.paid, v_sale.id,
      'Отмена продажи №' || v_sale.number || coalesce(': ' || nullif(trim(p_reason), ''), ''));
  end if;

  update public.sales
     set status = 'cancelled',
         cancelled_by = auth.uid(),
         cancelled_at = now(),
         note = concat_ws(' | ', note, 'Отмена: ' || nullif(trim(p_reason), ''))
   where id = p_sale_id
  returning * into v_sale;
  return v_sale;
end;
$$;

-- Долги клиентов с учётом возвратов (колонки те же)
create or replace view public.customer_balances with (security_invoker = true) as
with debts as (
  select s.customer_id, s.currency,
         sum(s.debt) - coalesce(sum(r.reduced), 0) as amount
    from public.sales s
    left join (select sale_id, sum(debt_reduction) as reduced from public.sale_returns group by 1) r on r.sale_id = s.id
   where s.status = 'completed' and s.customer_id is not null
   group by 1, 2
),
pays as (
  select customer_id, currency, sum(amount) as amount
    from public.customer_payments
   group by 1, 2
)
select coalesce(d.customer_id, p.customer_id) as customer_id,
       coalesce(d.currency, p.currency) as currency,
       coalesce(d.amount, 0) as total_debt,
       coalesce(p.amount, 0) as total_paid,
       coalesce(d.amount, 0) - coalesce(p.amount, 0) as balance
  from debts d
  full join pays p on p.customer_id = d.customer_id and p.currency = d.currency;

-- ---------------------------------------------------------------------------
-- Отчёты с учётом возвратов (возврат уменьшает выручку и себестоимость в день возврата)
-- ---------------------------------------------------------------------------
create or replace function public.report_summary(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_revenue numeric;
  v_cogs numeric;
  v_count bigint;
  v_discount numeric;
  v_expenses numeric;
  v_debt numeric;
  v_ret_rev numeric;
  v_ret_cogs numeric;
  v_ret_count bigint;
begin
  perform public.require_role('owner', 'admin', 'manager');

  select coalesce(sum(s.total * s.rate), 0), count(*), coalesce(sum(s.discount * s.rate), 0), coalesce(sum(s.debt * s.rate), 0)
    into v_revenue, v_count, v_discount, v_debt
    from public.sales s
   where s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to;

  select coalesce(sum(i.qty * i.cost_tjs), 0)
    into v_cogs
    from public.sale_items i
    join public.sales s on s.id = i.sale_id
   where s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to;

  select coalesce(sum(r.total * r.rate), 0), count(*)
    into v_ret_rev, v_ret_count
    from public.sale_returns r
   where r.created_at >= p_from and r.created_at < p_to;

  select coalesce(sum(ri.qty * ri.cost_tjs), 0)
    into v_ret_cogs
    from public.sale_return_items ri
    join public.sale_returns r on r.id = ri.return_id
   where r.created_at >= p_from and r.created_at < p_to;

  select coalesce(sum(e.amount * e.rate), 0)
    into v_expenses
    from public.expenses e
   where e.expense_date >= (p_from at time zone 'Asia/Dushanbe')::date
     and e.expense_date < (p_to at time zone 'Asia/Dushanbe')::date;

  v_revenue := v_revenue - v_ret_rev;
  v_cogs := v_cogs - v_ret_cogs;

  return jsonb_build_object(
    'revenue', round(v_revenue, 2),
    'cogs', round(v_cogs, 2),
    'gross_profit', round(v_revenue - v_cogs, 2),
    'expenses', round(v_expenses, 2),
    'net_profit', round(v_revenue - v_cogs - v_expenses, 2),
    'sales_count', v_count,
    'avg_check', case when v_count > 0 then round((v_revenue + v_ret_rev) / v_count, 2) else 0 end,
    'discounts', round(v_discount, 2),
    'new_debt', round(v_debt, 2),
    'returns', round(v_ret_rev, 2),
    'returns_count', v_ret_count
  );
end;
$$;

create or replace function public.report_daily(p_from timestamptz, p_to timestamptz)
returns table (day date, revenue numeric, profit numeric, expenses numeric, sales_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_role('owner', 'admin', 'manager');
  return query
  with days as (
    select generate_series((p_from at time zone 'Asia/Dushanbe')::date,
                           ((p_to - interval '1 microsecond') at time zone 'Asia/Dushanbe')::date,
                           interval '1 day')::date as d
  ),
  s as (
    select (x.created_at at time zone 'Asia/Dushanbe')::date as d, sum(x.total * x.rate) as revenue, count(*) as cnt
      from public.sales x
     where x.status = 'completed' and x.created_at >= p_from and x.created_at < p_to
     group by 1
  ),
  c as (
    select (x.created_at at time zone 'Asia/Dushanbe')::date as d, sum(i.qty * i.cost_tjs) as cogs
      from public.sale_items i join public.sales x on x.id = i.sale_id
     where x.status = 'completed' and x.created_at >= p_from and x.created_at < p_to
     group by 1
  ),
  r as (
    select (x.created_at at time zone 'Asia/Dushanbe')::date as d, sum(x.total * x.rate) as revenue
      from public.sale_returns x
     where x.created_at >= p_from and x.created_at < p_to
     group by 1
  ),
  rc as (
    select (x.created_at at time zone 'Asia/Dushanbe')::date as d, sum(i.qty * i.cost_tjs) as cogs
      from public.sale_return_items i join public.sale_returns x on x.id = i.return_id
     where x.created_at >= p_from and x.created_at < p_to
     group by 1
  ),
  e as (
    select x.expense_date as d, sum(x.amount * x.rate) as amount
      from public.expenses x
     where x.expense_date >= (p_from at time zone 'Asia/Dushanbe')::date
       and x.expense_date <= ((p_to - interval '1 microsecond') at time zone 'Asia/Dushanbe')::date
     group by 1
  )
  select days.d,
         round(coalesce(s.revenue, 0) - coalesce(r.revenue, 0), 2),
         round(coalesce(s.revenue, 0) - coalesce(r.revenue, 0) - coalesce(c.cogs, 0) + coalesce(rc.cogs, 0), 2),
         round(coalesce(e.amount, 0), 2),
         coalesce(s.cnt, 0)
    from days
    left join s on s.d = days.d
    left join c on c.d = days.d
    left join r on r.d = days.d
    left join rc on rc.d = days.d
    left join e on e.d = days.d
   order by days.d;
end;
$$;

create or replace function public.report_top_products(p_from timestamptz, p_to timestamptz, p_limit int default 10)
returns table (product_id uuid, name text, qty numeric, revenue numeric, profit numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_role('owner', 'admin', 'manager');
  return query
  with sold as (
    select i.product_id, max(i.product_name) as name, sum(i.qty) as qty,
           sum(i.total * s.rate) as revenue, sum(i.qty * i.cost_tjs) as cogs
      from public.sale_items i
      join public.sales s on s.id = i.sale_id
     where s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to
     group by i.product_id
  ),
  ret as (
    select ri.product_id, sum(ri.qty) as qty, sum(ri.total * r.rate) as revenue, sum(ri.qty * ri.cost_tjs) as cogs
      from public.sale_return_items ri
      join public.sale_returns r on r.id = ri.return_id
     where r.created_at >= p_from and r.created_at < p_to
     group by ri.product_id
  )
  select sold.product_id,
         sold.name,
         sold.qty - coalesce(ret.qty, 0),
         round(sold.revenue - coalesce(ret.revenue, 0), 2),
         round(sold.revenue - coalesce(ret.revenue, 0) - sold.cogs + coalesce(ret.cogs, 0), 2)
    from sold
    left join ret on ret.product_id = sold.product_id
   order by 4 desc
   limit greatest(coalesce(p_limit, 10), 1);
end;
$$;

create or replace function public.sales_daily(p_from timestamptz, p_to timestamptz)
returns table (day date, revenue numeric, sales_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_role('owner', 'admin', 'manager', 'cashier');
  return query
  with days as (
    select generate_series((p_from at time zone 'Asia/Dushanbe')::date,
                           ((p_to - interval '1 microsecond') at time zone 'Asia/Dushanbe')::date,
                           interval '1 day')::date as d
  ),
  s as (
    select (x.created_at at time zone 'Asia/Dushanbe')::date as d, sum(x.total * x.rate) as revenue, count(*) as cnt
      from public.sales x
     where x.status = 'completed' and x.created_at >= p_from and x.created_at < p_to
     group by 1
  ),
  r as (
    select (x.created_at at time zone 'Asia/Dushanbe')::date as d, sum(x.total * x.rate) as revenue
      from public.sale_returns x
     where x.created_at >= p_from and x.created_at < p_to
     group by 1
  )
  select days.d, round(coalesce(s.revenue, 0) - coalesce(r.revenue, 0), 2), coalesce(s.cnt, 0)
    from days left join s on s.d = days.d left join r on r.d = days.d
   order by days.d;
end;
$$;

-- ---------------------------------------------------------------------------
-- Смены кассира (одна общая касса → одновременно открыта одна смена)
-- ---------------------------------------------------------------------------
create table public.cash_shifts (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  opened_by uuid references public.profiles (id) on delete set null,
  opened_at timestamptz not null default now(),
  opening_tjs numeric(14, 2) not null,
  opening_cny numeric(14, 2) not null,
  opening_expected_tjs numeric(14, 2) not null,
  opening_expected_cny numeric(14, 2) not null,
  closed_by uuid references public.profiles (id) on delete set null,
  closed_at timestamptz,
  expected_tjs numeric(14, 2),
  expected_cny numeric(14, 2),
  counted_tjs numeric(14, 2),
  counted_cny numeric(14, 2),
  note text
);
create unique index cash_shifts_one_open on public.cash_shifts ((true)) where closed_at is null;
create index cash_shifts_opened_at_idx on public.cash_shifts (opened_at desc);

create or replace function public._cash_balance(p_currency public.currency_code)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(case when direction = 'in' then amount else -amount end), 0)
    from public.cash_transactions where currency = p_currency;
$$;

-- Открытие: пересчёт кассы; расхождение с учётом сразу проводится корректировкой
create or replace function public.open_shift(p_counted_tjs numeric, p_counted_cny numeric default 0, p_note text default null)
returns public.cash_shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.cash_shifts;
  v_exp_tjs numeric := public._cash_balance('TJS');
  v_exp_cny numeric := public._cash_balance('CNY');
begin
  perform public.require_role('owner', 'admin', 'cashier');
  if p_counted_tjs is null or p_counted_tjs < 0 or coalesce(p_counted_cny, 0) < 0 then
    raise exception 'Введите пересчитанные суммы (не меньше нуля)' using errcode = '22023';
  end if;
  if exists (select 1 from public.cash_shifts where closed_at is null) then
    raise exception 'Смена уже открыта — сначала закройте текущую' using errcode = '22023';
  end if;

  insert into public.cash_shifts (opened_by, opening_tjs, opening_cny, opening_expected_tjs, opening_expected_cny, note)
  values (auth.uid(), round(p_counted_tjs, 2), round(coalesce(p_counted_cny, 0), 2), v_exp_tjs, v_exp_cny, nullif(trim(p_note), ''))
  returning * into v_shift;

  if v_shift.opening_tjs <> v_exp_tjs then
    perform public._cash(case when v_shift.opening_tjs > v_exp_tjs then 'in' else 'out' end::public.cash_direction, 'shift_diff', 'TJS',
      abs(v_shift.opening_tjs - v_exp_tjs), v_shift.id, 'Расхождение при открытии смены №' || v_shift.number);
  end if;
  if v_shift.opening_cny <> v_exp_cny then
    perform public._cash(case when v_shift.opening_cny > v_exp_cny then 'in' else 'out' end::public.cash_direction, 'shift_diff', 'CNY',
      abs(v_shift.opening_cny - v_exp_cny), v_shift.id, 'Расхождение при открытии смены №' || v_shift.number);
  end if;
  return v_shift;
end;
$$;

create or replace function public.close_shift(p_counted_tjs numeric, p_counted_cny numeric default 0, p_note text default null)
returns public.cash_shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.cash_shifts;
  v_exp_tjs numeric := public._cash_balance('TJS');
  v_exp_cny numeric := public._cash_balance('CNY');
begin
  perform public.require_role('owner', 'admin', 'cashier');
  if p_counted_tjs is null or p_counted_tjs < 0 or coalesce(p_counted_cny, 0) < 0 then
    raise exception 'Введите пересчитанные суммы (не меньше нуля)' using errcode = '22023';
  end if;
  select * into v_shift from public.cash_shifts where closed_at is null for update;
  if not found then
    raise exception 'Нет открытой смены' using errcode = '22023';
  end if;

  update public.cash_shifts
     set closed_by = auth.uid(), closed_at = now(),
         expected_tjs = v_exp_tjs, expected_cny = v_exp_cny,
         counted_tjs = round(p_counted_tjs, 2), counted_cny = round(coalesce(p_counted_cny, 0), 2),
         note = concat_ws(' | ', note, nullif(trim(p_note), ''))
   where id = v_shift.id
  returning * into v_shift;

  if v_shift.counted_tjs <> v_exp_tjs then
    perform public._cash(case when v_shift.counted_tjs > v_exp_tjs then 'in' else 'out' end::public.cash_direction, 'shift_diff', 'TJS',
      abs(v_shift.counted_tjs - v_exp_tjs), v_shift.id, 'Расхождение при закрытии смены №' || v_shift.number);
  end if;
  if v_shift.counted_cny <> v_exp_cny then
    perform public._cash(case when v_shift.counted_cny > v_exp_cny then 'in' else 'out' end::public.cash_direction, 'shift_diff', 'CNY',
      abs(v_shift.counted_cny - v_exp_cny), v_shift.id, 'Расхождение при закрытии смены №' || v_shift.number);
  end if;
  return v_shift;
end;
$$;

-- Сводка смены: продажи, возвраты, движение наличных по источникам
create or replace function public.shift_summary(p_shift_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_shift public.cash_shifts;
  v_to timestamptz;
begin
  perform public.require_role('owner', 'admin', 'manager', 'cashier');
  select * into v_shift from public.cash_shifts where id = p_shift_id;
  if not found then
    raise exception 'Смена не найдена' using errcode = 'P0002';
  end if;
  v_to := coalesce(v_shift.closed_at, now());

  return jsonb_build_object(
    'sales', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select currency, payment_method, count(*) as count, sum(total) as total, sum(paid) as paid, sum(debt) as debt
          from public.sales
         where status = 'completed' and created_at >= v_shift.opened_at and created_at < v_to
         group by 1, 2 order by 1, 2
      ) x),
    'returns', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select currency, count(*) as count, sum(total) as total, sum(refund_amount) as refunded
          from public.sale_returns
         where created_at >= v_shift.opened_at and created_at < v_to
         group by 1 order by 1
      ) x),
    'cash', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select currency, source, direction, count(*) as count, sum(amount) as amount
          from public.cash_transactions
         where created_at >= v_shift.opened_at and created_at < v_to
         group by 1, 2, 3 order by 1, 2, 3
      ) x)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Права и RLS
-- ---------------------------------------------------------------------------
revoke all on public.sale_returns, public.sale_return_items, public.cash_shifts from anon, authenticated;
grant select on public.sale_returns, public.sale_return_items, public.cash_shifts to authenticated;

revoke execute on function public.return_sale_items(uuid, jsonb, public.payment_method, text) from public, anon;
revoke execute on function public.open_shift(numeric, numeric, text) from public, anon;
revoke execute on function public.close_shift(numeric, numeric, text) from public, anon;
revoke execute on function public.shift_summary(uuid) from public, anon;
revoke execute on function public._cash_balance(public.currency_code) from public, anon, authenticated;
grant execute on function
  public.return_sale_items(uuid, jsonb, public.payment_method, text),
  public.open_shift(numeric, numeric, text),
  public.close_shift(numeric, numeric, text),
  public.shift_summary(uuid)
to authenticated;

alter table public.sale_returns enable row level security;
alter table public.sale_return_items enable row level security;
alter table public.cash_shifts enable row level security;

create policy sale_returns_select on public.sale_returns for select to authenticated
  using (public.has_role('owner', 'admin', 'manager', 'cashier'));
create policy sale_return_items_select on public.sale_return_items for select to authenticated
  using (public.has_role('owner', 'admin', 'manager', 'cashier'));
create policy cash_shifts_select on public.cash_shifts for select to authenticated
  using (public.has_role('owner', 'admin', 'manager', 'cashier'));
