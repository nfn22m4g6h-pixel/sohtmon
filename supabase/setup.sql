-- SOHTMON ERP — полная установка базы данных для Supabase (версия 2.0-b).
-- Для НОВОГО проекта: вставьте ВЕСЬ файл в Supabase → SQL Editor → New query → Run.
-- Если база уже установлена — используйте supabase/upgrades/*.sql.


-- ======================================================================
-- 20261120000001_schema.sql
-- ======================================================================
-- SOHTMON ERP 1.0 — схема базы данных
-- Валюты: TJS (базовая) и CNY. rate = сколько TJS за 1 единицу валюты документа.

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Типы
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('owner', 'admin', 'manager', 'cashier', 'warehouse');
create type public.currency_code as enum ('TJS', 'CNY');
create type public.payment_method as enum ('cash', 'card', 'transfer');
create type public.sale_status as enum ('completed', 'cancelled');
create type public.movement_type as enum ('sale', 'sale_cancel', 'arrival', 'adjustment');
create type public.adjustment_reason as enum ('initial', 'inventory', 'damage', 'loss', 'return', 'other');
create type public.cash_direction as enum ('in', 'out');
create type public.cash_source as enum ('sale', 'sale_cancel', 'debt_payment', 'expense', 'arrival', 'manual');

-- ---------------------------------------------------------------------------
-- Сотрудники
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text,
  role public.app_role not null default 'cashier',
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Настройки (одна строка)
-- ---------------------------------------------------------------------------
create table public.settings (
  id smallint primary key default 1 check (id = 1),
  company_name text not null default 'SOHTMON',
  cny_rate numeric(14, 4) not null default 1.5 check (cny_rate > 0),
  receipt_footer text not null default 'Спасибо за покупку!',
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1);

-- ---------------------------------------------------------------------------
-- Справочники
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  description text,
  created_at timestamptz not null default now()
);
create unique index categories_name_key on public.categories (lower(name));

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text,
  barcode text,
  name text not null check (length(trim(name)) > 0),
  category_id uuid references public.categories (id) on delete set null,
  unit text not null default 'шт',
  purchase_price numeric(14, 2) not null default 0 check (purchase_price >= 0),
  purchase_currency public.currency_code not null default 'CNY',
  sale_price numeric(14, 2) not null default 0 check (sale_price >= 0),
  sale_currency public.currency_code not null default 'TJS',
  avg_cost_tjs numeric(14, 4) not null default 0 check (avg_cost_tjs >= 0),
  stock numeric(14, 3) not null default 0,
  min_stock numeric(14, 3) not null default 0 check (min_stock >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index products_sku_key on public.products (lower(sku)) where sku is not null and sku <> '';
create unique index products_barcode_key on public.products (barcode) where barcode is not null and barcode <> '';
create index products_category_idx on public.products (category_id);
create index products_name_trgm on public.products using gin (name extensions.gin_trgm_ops);
create index products_sku_trgm on public.products using gin (sku extensions.gin_trgm_ops);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  phone text,
  address text,
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index customers_name_trgm on public.customers using gin (name extensions.gin_trgm_ops);
create index customers_phone_idx on public.customers (phone);

-- ---------------------------------------------------------------------------
-- Продажи
-- ---------------------------------------------------------------------------
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  customer_id uuid references public.customers (id) on delete restrict,
  currency public.currency_code not null default 'TJS',
  rate numeric(14, 4) not null default 1 check (rate > 0),
  subtotal numeric(14, 2) not null check (subtotal >= 0),
  discount numeric(14, 2) not null default 0 check (discount >= 0),
  total numeric(14, 2) not null check (total >= 0),
  paid numeric(14, 2) not null default 0 check (paid >= 0),
  debt numeric(14, 2) generated always as (total - paid) stored,
  payment_method public.payment_method not null default 'cash',
  status public.sale_status not null default 'completed',
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  cancelled_by uuid references public.profiles (id) on delete set null,
  cancelled_at timestamptz,
  check (paid <= total),
  check (discount <= subtotal)
);
create index sales_created_at_idx on public.sales (created_at desc);
create index sales_customer_idx on public.sales (customer_id);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  product_name text not null,
  qty numeric(14, 3) not null check (qty > 0),
  price numeric(14, 2) not null check (price >= 0),
  total numeric(14, 2) not null,
  cost_tjs numeric(14, 4) not null default 0
);
create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_items_product_idx on public.sale_items (product_id);

-- ---------------------------------------------------------------------------
-- Склад
-- ---------------------------------------------------------------------------
create table public.stock_arrivals (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  supplier text,
  currency public.currency_code not null default 'CNY',
  rate numeric(14, 4) not null default 1 check (rate > 0),
  total numeric(14, 2) not null default 0,
  paid_from_cash boolean not null default false,
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index stock_arrivals_created_at_idx on public.stock_arrivals (created_at desc);

create table public.stock_arrival_items (
  id uuid primary key default gen_random_uuid(),
  arrival_id uuid not null references public.stock_arrivals (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  qty numeric(14, 3) not null check (qty > 0),
  cost numeric(14, 2) not null check (cost >= 0),
  total numeric(14, 2) not null
);
create index stock_arrival_items_arrival_idx on public.stock_arrival_items (arrival_id);

create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  qty_delta numeric(14, 3) not null check (qty_delta <> 0),
  reason public.adjustment_reason not null,
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index stock_adjustments_created_at_idx on public.stock_adjustments (created_at desc);

create table public.stock_movements (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products (id) on delete restrict,
  type public.movement_type not null,
  qty_delta numeric(14, 3) not null,
  stock_after numeric(14, 3),
  ref_id uuid,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index stock_movements_product_idx on public.stock_movements (product_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Деньги
-- ---------------------------------------------------------------------------
create table public.customer_payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete restrict,
  currency public.currency_code not null,
  amount numeric(14, 2) not null check (amount > 0),
  method public.payment_method not null default 'cash',
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index customer_payments_customer_idx on public.customer_payments (customer_id, created_at desc);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null check (length(trim(category)) > 0),
  amount numeric(14, 2) not null check (amount > 0),
  currency public.currency_code not null default 'TJS',
  rate numeric(14, 4) not null default 1 check (rate > 0),
  expense_date date not null default current_date,
  paid_from_cash boolean not null default true,
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index expenses_date_idx on public.expenses (expense_date desc);

create table public.cash_transactions (
  id bigint generated always as identity primary key,
  direction public.cash_direction not null,
  source public.cash_source not null,
  currency public.currency_code not null,
  amount numeric(14, 2) not null check (amount > 0),
  ref_id uuid,
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index cash_transactions_created_at_idx on public.cash_transactions (created_at desc);

-- ======================================================================
-- 20261120000002_functions.sql
-- ======================================================================
-- SOHTMON ERP 1.0 — роли, триггеры и бизнес-функции.
-- Все операции с остатками и деньгами выполняются здесь, в одной транзакции.

-- ---------------------------------------------------------------------------
-- Роли текущего пользователя
-- ---------------------------------------------------------------------------
create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.is_active;
$$;

create or replace function public.has_role(variadic roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = any (roles), false);
$$;

create or replace function public.require_role(variadic roles public.app_role[])
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role(variadic roles) then
    raise exception 'Недостаточно прав для этой операции' using errcode = '42501';
  end if;
end;
$$;

-- Курс валюты к TJS
create or replace function public.currency_rate(p_currency public.currency_code)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case when p_currency = 'TJS' then 1::numeric else (select cny_rate from public.settings where id = 1) end;
$$;

-- ---------------------------------------------------------------------------
-- Новый пользователь Auth → профиль сотрудника
-- Первый пользователь становится владельцем. Остальные неактивны до настройки.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first boolean;
begin
  perform pg_advisory_xact_lock(hashtext('sohtmon_first_owner'));
  select not exists (select 1 from public.profiles where role = 'owner') into v_first;
  insert into public.profiles (id, full_name, phone, role, is_active)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, ''), '@', 1)),
    nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
    case when v_first then 'owner'::public.app_role else 'cashier'::public.app_role end,
    v_first
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

alter table public.customers alter column created_by set default auth.uid();

-- ---------------------------------------------------------------------------
-- Внутреннее: изменение остатка + запись в журнал
-- ---------------------------------------------------------------------------
create or replace function public._apply_stock(
  p_product_id uuid,
  p_delta numeric,
  p_type public.movement_type,
  p_ref_id uuid,
  p_allow_negative boolean default false
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock numeric;
  v_name text;
begin
  update public.products
     set stock = stock + p_delta
   where id = p_product_id
  returning stock, name into v_stock, v_name;

  if not found then
    raise exception 'Товар не найден' using errcode = 'P0002';
  end if;
  if v_stock < 0 and not p_allow_negative then
    raise exception 'Недостаточно товара «%» на складе (не хватает %)', v_name, -v_stock using errcode = 'P0001';
  end if;

  insert into public.stock_movements (product_id, type, qty_delta, stock_after, ref_id, created_by)
  values (p_product_id, p_type, p_delta, v_stock, p_ref_id, auth.uid());
  return v_stock;
end;
$$;

create or replace function public._cash(
  p_direction public.cash_direction,
  p_source public.cash_source,
  p_currency public.currency_code,
  p_amount numeric,
  p_ref_id uuid,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_amount is null or p_amount <= 0 then
    return;
  end if;
  insert into public.cash_transactions (direction, source, currency, amount, ref_id, note, created_by)
  values (p_direction, p_source, p_currency, round(p_amount, 2), p_ref_id, p_note, auth.uid());
end;
$$;

-- ---------------------------------------------------------------------------
-- Продажа
-- p_items: [{"product_id": uuid, "qty": number, "price": number?}]
-- Цену вручную может задать только owner/admin/manager; иначе — цена из каталога.
-- ---------------------------------------------------------------------------
create or replace function public.create_sale(
  p_items jsonb,
  p_currency public.currency_code default 'TJS',
  p_customer_id uuid default null,
  p_discount numeric default 0,
  p_paid numeric default null,
  p_payment_method public.payment_method default 'cash',
  p_note text default null
)
returns public.sales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales;
  v_rate numeric := public.currency_rate(p_currency);
  v_can_price boolean := public.has_role('owner', 'admin', 'manager');
  v_item jsonb;
  v_product public.products;
  v_qty numeric;
  v_price numeric;
  v_subtotal numeric := 0;
  v_total numeric;
  v_paid numeric;
  v_discount numeric := round(coalesce(p_discount, 0), 2);
begin
  perform public.require_role('owner', 'admin', 'manager', 'cashier');

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Добавьте хотя бы один товар' using errcode = '22023';
  end if;
  if p_customer_id is not null and not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'Клиент не найден' using errcode = 'P0002';
  end if;

  -- Предварительный расчёт суммы
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'qty')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Количество должно быть больше нуля' using errcode = '22023';
    end if;
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid and is_active;
    if not found then
      raise exception 'Товар не найден или неактивен' using errcode = 'P0002';
    end if;
    if v_can_price and v_item ? 'price' and (v_item ->> 'price') is not null then
      v_price := round((v_item ->> 'price')::numeric, 2);
      if v_price < 0 then
        raise exception 'Цена не может быть отрицательной' using errcode = '22023';
      end if;
    else
      v_price := round(v_product.sale_price * public.currency_rate(v_product.sale_currency) / v_rate, 2);
    end if;
    v_subtotal := v_subtotal + round(v_qty * v_price, 2);
  end loop;

  if v_discount < 0 or v_discount > v_subtotal then
    raise exception 'Неверная скидка' using errcode = '22023';
  end if;
  if v_discount > 0 and not v_can_price then
    raise exception 'Скидку может дать только менеджер, админ или владелец' using errcode = '42501';
  end if;
  v_total := v_subtotal - v_discount;
  v_paid := round(coalesce(p_paid, v_total), 2);
  if v_paid < 0 or v_paid > v_total then
    raise exception 'Сумма оплаты должна быть от 0 до %', v_total using errcode = '22023';
  end if;
  if v_paid < v_total and p_customer_id is null then
    raise exception 'Для продажи в долг выберите клиента' using errcode = '22023';
  end if;

  insert into public.sales (customer_id, currency, rate, subtotal, discount, total, paid, payment_method, note, created_by)
  values (p_customer_id, p_currency, v_rate, v_subtotal, v_discount, v_total, v_paid, p_payment_method, nullif(trim(p_note), ''), auth.uid())
  returning * into v_sale;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'qty')::numeric;
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid for update;
    if v_can_price and v_item ? 'price' and (v_item ->> 'price') is not null then
      v_price := round((v_item ->> 'price')::numeric, 2);
    else
      v_price := round(v_product.sale_price * public.currency_rate(v_product.sale_currency) / v_rate, 2);
    end if;
    insert into public.sale_items (sale_id, product_id, product_name, qty, price, total, cost_tjs)
    values (v_sale.id, v_product.id, v_product.name, v_qty, v_price, round(v_qty * v_price, 2), v_product.avg_cost_tjs);
    perform public._apply_stock(v_product.id, -v_qty, 'sale', v_sale.id);
  end loop;

  if p_payment_method = 'cash' then
    perform public._cash('in', 'sale', p_currency, v_paid, v_sale.id, 'Продажа №' || v_sale.number);
  end if;

  return v_sale;
end;
$$;

-- ---------------------------------------------------------------------------
-- Отмена продажи (сторно)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Приход товара
-- p_items: [{"product_id": uuid, "qty": number, "cost": number}]  cost — в валюте прихода
-- ---------------------------------------------------------------------------
create or replace function public.create_arrival(
  p_items jsonb,
  p_currency public.currency_code default 'CNY',
  p_supplier text default null,
  p_paid_from_cash boolean default false,
  p_note text default null
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
  v_product public.products;
  v_qty numeric;
  v_cost numeric;
  v_base numeric;
  v_total numeric := 0;
begin
  perform public.require_role('owner', 'admin', 'manager', 'warehouse');

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Добавьте хотя бы один товар' using errcode = '22023';
  end if;

  insert into public.stock_arrivals (supplier, currency, rate, paid_from_cash, note, created_by)
  values (nullif(trim(p_supplier), ''), p_currency, v_rate, coalesce(p_paid_from_cash, false), nullif(trim(p_note), ''), auth.uid())
  returning * into v_arrival;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'qty')::numeric;
    v_cost := round(coalesce((v_item ->> 'cost')::numeric, 0), 2);
    if v_qty is null or v_qty <= 0 then
      raise exception 'Количество должно быть больше нуля' using errcode = '22023';
    end if;
    if v_cost < 0 then
      raise exception 'Цена закупки не может быть отрицательной' using errcode = '22023';
    end if;
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid for update;
    if not found then
      raise exception 'Товар не найден' using errcode = 'P0002';
    end if;

    -- Скользящая средняя себестоимость в TJS
    v_base := greatest(v_product.stock, 0);
    update public.products
       set avg_cost_tjs = round((v_base * avg_cost_tjs + v_qty * v_cost * v_rate) / (v_base + v_qty), 4),
           purchase_price = v_cost,
           purchase_currency = p_currency
     where id = v_product.id;

    insert into public.stock_arrival_items (arrival_id, product_id, qty, cost, total)
    values (v_arrival.id, v_product.id, v_qty, v_cost, round(v_qty * v_cost, 2));
    perform public._apply_stock(v_product.id, v_qty, 'arrival', v_arrival.id);
    v_total := v_total + round(v_qty * v_cost, 2);
  end loop;

  update public.stock_arrivals set total = v_total where id = v_arrival.id returning * into v_arrival;

  if v_arrival.paid_from_cash then
    perform public._cash('out', 'arrival', p_currency, v_total, v_arrival.id, 'Приход №' || v_arrival.number);
  end if;
  return v_arrival;
end;
$$;

-- ---------------------------------------------------------------------------
-- Корректировка остатка
-- ---------------------------------------------------------------------------
create or replace function public.create_adjustment(
  p_product_id uuid,
  p_qty_delta numeric,
  p_reason public.adjustment_reason,
  p_note text default null
)
returns public.stock_adjustments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adj public.stock_adjustments;
  v_product public.products;
begin
  perform public.require_role('owner', 'admin', 'manager', 'warehouse');

  if p_qty_delta is null or p_qty_delta = 0 then
    raise exception 'Изменение количества не может быть нулевым' using errcode = '22023';
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    raise exception 'Товар не найден' using errcode = 'P0002';
  end if;

  -- Если себестоимость ещё неизвестна, берём закупочную цену товара
  if p_qty_delta > 0 and v_product.avg_cost_tjs = 0 and v_product.purchase_price > 0 then
    update public.products
       set avg_cost_tjs = round(purchase_price * public.currency_rate(purchase_currency), 4)
     where id = p_product_id;
  end if;

  insert into public.stock_adjustments (product_id, qty_delta, reason, note, created_by)
  values (p_product_id, p_qty_delta, p_reason, nullif(trim(p_note), ''), auth.uid())
  returning * into v_adj;

  perform public._apply_stock(p_product_id, p_qty_delta, 'adjustment', v_adj.id);
  return v_adj;
end;
$$;

-- ---------------------------------------------------------------------------
-- Оплата долга клиентом
-- ---------------------------------------------------------------------------
create or replace function public.add_customer_payment(
  p_customer_id uuid,
  p_amount numeric,
  p_currency public.currency_code default 'TJS',
  p_method public.payment_method default 'cash',
  p_note text default null
)
returns public.customer_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.customer_payments;
  v_name text;
begin
  perform public.require_role('owner', 'admin', 'manager', 'cashier');

  if p_amount is null or p_amount <= 0 then
    raise exception 'Сумма должна быть больше нуля' using errcode = '22023';
  end if;
  select name into v_name from public.customers where id = p_customer_id;
  if not found then
    raise exception 'Клиент не найден' using errcode = 'P0002';
  end if;

  insert into public.customer_payments (customer_id, currency, amount, method, note, created_by)
  values (p_customer_id, p_currency, round(p_amount, 2), p_method, nullif(trim(p_note), ''), auth.uid())
  returning * into v_payment;

  if p_method = 'cash' then
    perform public._cash('in', 'debt_payment', p_currency, v_payment.amount, v_payment.id, 'Оплата долга: ' || v_name);
  end if;
  return v_payment;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ручная кассовая операция (внесение / изъятие)
-- ---------------------------------------------------------------------------
create or replace function public.add_cash_operation(
  p_direction public.cash_direction,
  p_amount numeric,
  p_currency public.currency_code default 'TJS',
  p_note text default null
)
returns public.cash_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.cash_transactions;
begin
  perform public.require_role('owner', 'admin', 'cashier');
  if p_amount is null or p_amount <= 0 then
    raise exception 'Сумма должна быть больше нуля' using errcode = '22023';
  end if;
  if nullif(trim(p_note), '') is null then
    raise exception 'Укажите комментарий к операции' using errcode = '22023';
  end if;
  insert into public.cash_transactions (direction, source, currency, amount, note, created_by)
  values (p_direction, 'manual', p_currency, round(p_amount, 2), trim(p_note), auth.uid())
  returning * into v_tx;
  return v_tx;
end;
$$;

-- ---------------------------------------------------------------------------
-- Расходы
-- ---------------------------------------------------------------------------
create or replace function public.create_expense(
  p_category text,
  p_amount numeric,
  p_currency public.currency_code default 'TJS',
  p_expense_date date default current_date,
  p_paid_from_cash boolean default true,
  p_note text default null
)
returns public.expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exp public.expenses;
begin
  perform public.require_role('owner', 'admin', 'manager');
  if p_amount is null or p_amount <= 0 then
    raise exception 'Сумма должна быть больше нуля' using errcode = '22023';
  end if;
  if nullif(trim(p_category), '') is null then
    raise exception 'Укажите категорию расхода' using errcode = '22023';
  end if;

  insert into public.expenses (category, amount, currency, rate, expense_date, paid_from_cash, note, created_by)
  values (trim(p_category), round(p_amount, 2), p_currency, public.currency_rate(p_currency),
          coalesce(p_expense_date, current_date), coalesce(p_paid_from_cash, true), nullif(trim(p_note), ''), auth.uid())
  returning * into v_exp;

  if v_exp.paid_from_cash then
    perform public._cash('out', 'expense', v_exp.currency, v_exp.amount, v_exp.id, 'Расход: ' || v_exp.category);
  end if;
  return v_exp;
end;
$$;

create or replace function public.delete_expense(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exp public.expenses;
begin
  perform public.require_role('owner', 'admin');
  delete from public.expenses where id = p_expense_id returning * into v_exp;
  if not found then
    raise exception 'Расход не найден' using errcode = 'P0002';
  end if;
  if v_exp.paid_from_cash then
    perform public._cash('in', 'expense', v_exp.currency, v_exp.amount, v_exp.id, 'Удалён расход: ' || v_exp.category);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Сотрудники
-- ---------------------------------------------------------------------------
create or replace function public.set_employee(
  p_user_id uuid,
  p_role public.app_role,
  p_is_active boolean,
  p_full_name text default null,
  p_phone text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me public.app_role := public.current_app_role();
  v_target public.profiles;
  v_owners int;
begin
  perform public.require_role('owner', 'admin');

  select * into v_target from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'Сотрудник не найден' using errcode = 'P0002';
  end if;

  if v_me = 'admin' and (v_target.role = 'owner' or p_role = 'owner') then
    raise exception 'Администратор не может управлять владельцами' using errcode = '42501';
  end if;
  if v_me = 'admin' and v_target.role = 'admin' and v_target.id <> auth.uid() then
    raise exception 'Администратор не может изменять других администраторов' using errcode = '42501';
  end if;

  if v_target.role = 'owner' and (p_role <> 'owner' or not p_is_active) then
    select count(*) into v_owners from public.profiles where role = 'owner' and is_active;
    if v_owners <= 1 then
      raise exception 'Нельзя снять или отключить последнего владельца' using errcode = '22023';
    end if;
  end if;

  update public.profiles
     set role = p_role,
         is_active = p_is_active,
         full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
         phone = case when p_phone is null then phone else nullif(trim(p_phone), '') end
   where id = p_user_id
  returning * into v_target;
  return v_target;
end;
$$;

create or replace function public.update_my_profile(p_full_name text, p_phone text default null)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Требуется вход' using errcode = '42501';
  end if;
  update public.profiles
     set full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
         phone = nullif(trim(p_phone), '')
   where id = auth.uid()
  returning * into v_profile;
  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- Отчёты (всё в TJS, дни по времени Душанбе)
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

  select coalesce(sum(e.amount * e.rate), 0)
    into v_expenses
    from public.expenses e
   where e.expense_date >= (p_from at time zone 'Asia/Dushanbe')::date
     and e.expense_date < (p_to at time zone 'Asia/Dushanbe')::date;

  return jsonb_build_object(
    'revenue', round(v_revenue, 2),
    'cogs', round(v_cogs, 2),
    'gross_profit', round(v_revenue - v_cogs, 2),
    'expenses', round(v_expenses, 2),
    'net_profit', round(v_revenue - v_cogs - v_expenses, 2),
    'sales_count', v_count,
    'avg_check', case when v_count > 0 then round(v_revenue / v_count, 2) else 0 end,
    'discounts', round(v_discount, 2),
    'new_debt', round(v_debt, 2)
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
    select (x.created_at at time zone 'Asia/Dushanbe')::date as d,
           sum(x.total * x.rate) as revenue,
           count(*) as cnt
      from public.sales x
     where x.status = 'completed' and x.created_at >= p_from and x.created_at < p_to
     group by 1
  ),
  c as (
    select (x.created_at at time zone 'Asia/Dushanbe')::date as d,
           sum(i.qty * i.cost_tjs) as cogs
      from public.sale_items i join public.sales x on x.id = i.sale_id
     where x.status = 'completed' and x.created_at >= p_from and x.created_at < p_to
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
         round(coalesce(s.revenue, 0), 2),
         round(coalesce(s.revenue, 0) - coalesce(c.cogs, 0), 2),
         round(coalesce(e.amount, 0), 2),
         coalesce(s.cnt, 0)
    from days
    left join s on s.d = days.d
    left join c on c.d = days.d
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
  select i.product_id,
         max(i.product_name),
         sum(i.qty),
         round(sum(i.total * s.rate), 2),
         round(sum(i.total * s.rate - i.qty * i.cost_tjs), 2)
    from public.sale_items i
    join public.sales s on s.id = i.sale_id
   where s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to
   group by i.product_id
   order by 4 desc
   limit greatest(coalesce(p_limit, 10), 1);
end;
$$;

-- Продажи по дням для кассира/всех с доступом к продажам (без прибыли)
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
  )
  select days.d, round(coalesce(s.revenue, 0), 2), coalesce(s.cnt, 0)
    from days left join s on s.d = days.d
   order by days.d;
end;
$$;

-- ---------------------------------------------------------------------------
-- Представления (security_invoker → действуют RLS вызывающего)
-- ---------------------------------------------------------------------------
create view public.customer_balances with (security_invoker = true) as
with debts as (
  select customer_id, currency, sum(debt) as amount
    from public.sales
   where status = 'completed' and customer_id is not null
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

create view public.cash_balances with (security_invoker = true) as
select currency,
       sum(case when direction = 'in' then amount else -amount end) as balance,
       sum(case when direction = 'in' then amount else 0 end) as total_in,
       sum(case when direction = 'out' then amount else 0 end) as total_out
  from public.cash_transactions
 group by currency;

create view public.low_stock_products with (security_invoker = true) as
select p.*
  from public.products p
 where p.is_active and p.stock <= p.min_stock;

-- ======================================================================
-- 20261120000003_rls.sql
-- ======================================================================
-- SOHTMON ERP 1.0 — привилегии и Row Level Security.
-- Журналы (продажи, движения, касса, оплаты, расходы) изменяются только
-- через функции SECURITY DEFINER — прямой записи у клиентов нет.

-- ---------------------------------------------------------------------------
-- Привилегии таблиц
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on all tables in schema public to authenticated;

grant insert (name, description), update (name, description), delete
  on public.categories to authenticated;

-- stock и avg_cost_tjs изменяются только функциями склада
grant insert (sku, barcode, name, category_id, unit, purchase_price, purchase_currency,
              sale_price, sale_currency, min_stock, is_active),
      update (sku, barcode, name, category_id, unit, purchase_price, purchase_currency,
              sale_price, sale_currency, min_stock, is_active),
      delete
  on public.products to authenticated;

grant insert (name, phone, address, note), update (name, phone, address, note), delete
  on public.customers to authenticated;

grant update (company_name, cny_rate, receipt_footer) on public.settings to authenticated;

-- ---------------------------------------------------------------------------
-- Привилегии функций
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.current_app_role(),
  public.has_role(public.app_role[]),
  public.currency_rate(public.currency_code),
  public.create_sale(jsonb, public.currency_code, uuid, numeric, numeric, public.payment_method, text),
  public.cancel_sale(uuid, text),
  public.create_arrival(jsonb, public.currency_code, text, boolean, text),
  public.create_adjustment(uuid, numeric, public.adjustment_reason, text),
  public.add_customer_payment(uuid, numeric, public.currency_code, public.payment_method, text),
  public.add_cash_operation(public.cash_direction, numeric, public.currency_code, text),
  public.create_expense(text, numeric, public.currency_code, date, boolean, text),
  public.delete_expense(uuid),
  public.set_employee(uuid, public.app_role, boolean, text, text),
  public.update_my_profile(text, text),
  public.report_summary(timestamptz, timestamptz),
  public.report_daily(timestamptz, timestamptz),
  public.report_top_products(timestamptz, timestamptz, int),
  public.sales_daily(timestamptz, timestamptz)
to authenticated;

-- Новые объекты не получают прав по умолчанию
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.stock_arrivals enable row level security;
alter table public.stock_arrival_items enable row level security;
alter table public.stock_adjustments enable row level security;
alter table public.stock_movements enable row level security;
alter table public.customer_payments enable row level security;
alter table public.expenses enable row level security;
alter table public.cash_transactions enable row level security;

-- Профили: свой профиль виден всегда (чтобы показать «аккаунт не активирован»),
-- остальные — только активным сотрудникам.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.current_app_role() is not null);

create policy settings_select on public.settings for select to authenticated
  using (public.current_app_role() is not null);
create policy settings_update on public.settings for update to authenticated
  using (public.has_role('owner', 'admin'))
  with check (public.has_role('owner', 'admin'));

-- Категории и товары
create policy categories_select on public.categories for select to authenticated
  using (public.current_app_role() is not null);
create policy categories_insert on public.categories for insert to authenticated
  with check (public.has_role('owner', 'admin', 'manager', 'warehouse'));
create policy categories_update on public.categories for update to authenticated
  using (public.has_role('owner', 'admin', 'manager', 'warehouse'))
  with check (public.has_role('owner', 'admin', 'manager', 'warehouse'));
create policy categories_delete on public.categories for delete to authenticated
  using (public.has_role('owner', 'admin', 'manager', 'warehouse'));

create policy products_select on public.products for select to authenticated
  using (public.current_app_role() is not null);
create policy products_insert on public.products for insert to authenticated
  with check (public.has_role('owner', 'admin', 'manager', 'warehouse'));
create policy products_update on public.products for update to authenticated
  using (public.has_role('owner', 'admin', 'manager', 'warehouse'))
  with check (public.has_role('owner', 'admin', 'manager', 'warehouse'));
create policy products_delete on public.products for delete to authenticated
  using (public.has_role('owner', 'admin'));

-- Клиенты
create policy customers_select on public.customers for select to authenticated
  using (public.has_role('owner', 'admin', 'manager', 'cashier'));
create policy customers_insert on public.customers for insert to authenticated
  with check (public.has_role('owner', 'admin', 'manager', 'cashier'));
create policy customers_update on public.customers for update to authenticated
  using (public.has_role('owner', 'admin', 'manager', 'cashier'))
  with check (public.has_role('owner', 'admin', 'manager', 'cashier'));
create policy customers_delete on public.customers for delete to authenticated
  using (public.has_role('owner', 'admin'));

-- Продажи (только чтение)
create policy sales_select on public.sales for select to authenticated
  using (public.has_role('owner', 'admin', 'manager', 'cashier'));
create policy sale_items_select on public.sale_items for select to authenticated
  using (public.has_role('owner', 'admin', 'manager', 'cashier'));

-- Склад (только чтение)
create policy stock_arrivals_select on public.stock_arrivals for select to authenticated
  using (public.has_role('owner', 'admin', 'manager', 'warehouse'));
create policy stock_arrival_items_select on public.stock_arrival_items for select to authenticated
  using (public.has_role('owner', 'admin', 'manager', 'warehouse'));
create policy stock_adjustments_select on public.stock_adjustments for select to authenticated
  using (public.has_role('owner', 'admin', 'manager', 'warehouse'));
create policy stock_movements_select on public.stock_movements for select to authenticated
  using (public.has_role('owner', 'admin', 'manager', 'warehouse'));

-- Деньги (только чтение)
create policy customer_payments_select on public.customer_payments for select to authenticated
  using (public.has_role('owner', 'admin', 'manager', 'cashier'));
create policy expenses_select on public.expenses for select to authenticated
  using (public.has_role('owner', 'admin', 'manager'));
create policy cash_transactions_select on public.cash_transactions for select to authenticated
  using (public.has_role('owner', 'admin', 'manager', 'cashier'));

-- ======================================================================
-- 20261121000001_v2_suppliers.sql
-- ======================================================================
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

-- ======================================================================
-- 20261122000001_v2b_returns_shifts.sql
-- ======================================================================
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
