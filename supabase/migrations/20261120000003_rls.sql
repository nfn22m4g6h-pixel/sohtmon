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
