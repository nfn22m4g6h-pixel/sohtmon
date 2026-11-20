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
