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
