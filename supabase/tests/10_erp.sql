-- SOHTMON ERP — тесты ролей, RLS и бизнес-логики.
-- Запуск: scripts/test-db.sh (после 00_supabase_shim.sql и миграций).
\set ON_ERROR_STOP 1
set client_min_messages = notice;

-- ---------------------------------------------------------------------------
-- Тестовые помощники
-- ---------------------------------------------------------------------------
create schema tst;
create table tst.ids (k text primary key, id uuid not null);
grant usage on schema tst to authenticated, anon;
grant select, insert on tst.ids to authenticated, anon;

create function tst.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then
    raise exception 'FAIL: %', p_msg;
  end if;
  raise notice 'ok - %', p_msg;
end $$;

-- Ожидаем ошибку. p_like — фрагмент текста ошибки (или null)
create function tst.throws(p_sql text, p_msg text, p_like text default null) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if p_like is not null and sqlerrm not ilike '%' || p_like || '%' then
      raise exception 'FAIL: % (неожиданная ошибка: %)', p_msg, sqlerrm;
    end if;
    raise notice 'ok - % [%]', p_msg, sqlerrm;
    return;
  end;
  raise exception 'FAIL: % (ошибки не было)', p_msg;
end $$;

create function tst.lives(p_sql text, p_msg text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise notice 'ok - %', p_msg;
exception when others then
  raise exception 'FAIL: % (%)', p_msg, sqlerrm;
end $$;

create function tst.id(p_k text) returns uuid language sql stable as $$ select id from tst.ids where k = p_k $$;
create function tst.login(p_k text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce((select id::text from tst.ids where k = p_k), ''), false);
$$;
grant execute on all functions in schema tst to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 1. Регистрация: первый — владелец, остальные неактивны
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', 'owner@test.tj', '{"full_name":"Салим Владелец"}'),
  ('00000000-0000-0000-0000-000000000002', 'admin@test.tj', '{"full_name":"Админ","role":"owner"}'),
  ('00000000-0000-0000-0000-000000000003', 'manager@test.tj', '{}'),
  ('00000000-0000-0000-0000-000000000004', 'cashier@test.tj', '{}'),
  ('00000000-0000-0000-0000-000000000005', 'warehouse@test.tj', '{}'),
  ('00000000-0000-0000-0000-000000000006', 'blocked@test.tj', '{}');
insert into tst.ids values
  ('owner', '00000000-0000-0000-0000-000000000001'),
  ('admin', '00000000-0000-0000-0000-000000000002'),
  ('manager', '00000000-0000-0000-0000-000000000003'),
  ('cashier', '00000000-0000-0000-0000-000000000004'),
  ('warehouse', '00000000-0000-0000-0000-000000000005'),
  ('blocked', '00000000-0000-0000-0000-000000000006');

select tst.ok((select role = 'owner' and is_active from profiles where id = tst.id('owner')), 'первый пользователь — активный владелец');
select tst.ok((select full_name = 'Салим Владелец' from profiles where id = tst.id('owner')), 'ФИО взято из метаданных');
select tst.ok((select role = 'cashier' and not is_active from profiles where id = tst.id('admin')), 'роль из метаданных игнорируется, новый — неактивен');

-- ---------------------------------------------------------------------------
-- 2. Сотрудники: владелец назначает роли
-- ---------------------------------------------------------------------------
set role authenticated;
select tst.login('admin');
select tst.ok(current_app_role() is null, 'неактивный не имеет роли');
select tst.throws($$select set_employee(tst.id('admin'), 'owner', true)$$, 'неактивный не может назначить себя владельцем', 'Недостаточно прав');
select tst.ok((select count(*) from profiles) = 1, 'неактивный видит только свой профиль');
select tst.ok((select count(*) from products) = 0, 'неактивный не видит товары');

select tst.login('owner');
select tst.lives($$select set_employee(tst.id('admin'), 'admin', true, 'Админ Админов')$$, 'владелец назначает админа');
select tst.login('admin');
select tst.lives($$select set_employee(tst.id('manager'), 'manager', true)$$, 'админ назначает менеджера');
select tst.lives($$select set_employee(tst.id('cashier'), 'cashier', true)$$, 'админ назначает кассира');
select tst.lives($$select set_employee(tst.id('warehouse'), 'warehouse', true)$$, 'админ назначает кладовщика');
select tst.throws($$select set_employee(tst.id('blocked'), 'owner', true)$$, 'админ не может назначить владельца', 'владельцами');
select tst.throws($$select set_employee(tst.id('owner'), 'cashier', true)$$, 'админ не может понизить владельца', 'владельцами');
select tst.throws($$update profiles set role = 'owner' where id = auth.uid()$$, 'прямое изменение профиля запрещено', 'permission denied');
select tst.login('owner');
select tst.throws($$select set_employee(tst.id('owner'), 'admin', true)$$, 'нельзя снять последнего владельца', 'последнего владельца');
select tst.login('manager');
select tst.throws($$select set_employee(tst.id('cashier'), 'admin', true)$$, 'менеджер не управляет сотрудниками', 'Недостаточно прав');
select tst.lives($$select update_my_profile('Менеджер Мира', '+992900000003')$$, 'сотрудник меняет своё ФИО');
reset role;
select tst.ok((select full_name = 'Менеджер Мира' and role = 'manager' from profiles where id = tst.id('manager')), 'update_my_profile не меняет роль');

-- ---------------------------------------------------------------------------
-- 3. Настройки, категории, товары
-- ---------------------------------------------------------------------------
set role authenticated;
select tst.login('manager');
select tst.ok((select count(*) from settings where cny_rate > 0) = 1, 'менеджер читает настройки');
update settings set cny_rate = 99;
select tst.ok((select cny_rate from settings) = 1.5, 'менеджер не может менять курс (RLS)');
select tst.login('owner');
update settings set cny_rate = 1.6;
select tst.ok((select cny_rate from settings) = 1.6, 'владелец меняет курс CNY');

select tst.login('warehouse');
insert into categories (name) values ('Бетономешалки') returning id \gset cat_
insert into tst.ids values ('cat', :'cat_id');
select tst.lives($$insert into products (sku, name, category_id, purchase_price, purchase_currency, sale_price, sale_currency, min_stock)
  values ('BM-120', 'Бетономешалка 120 л', tst.id('cat'), 500, 'CNY', 1200, 'TJS', 2)$$, 'кладовщик создаёт товар');
select tst.lives($$insert into products (sku, name, category_id, purchase_price, purchase_currency, sale_price, sale_currency)
  values ('BM-180', 'Бетономешалка 180 л', tst.id('cat'), 800, 'CNY', 200, 'CNY')$$, 'товар с ценой в CNY');
insert into tst.ids select 'p120', id from products where sku = 'BM-120';
insert into tst.ids select 'p180', id from products where sku = 'BM-180';
select tst.throws($$insert into products (name, stock) values ('Хак', 1000)$$, 'нельзя создать товар с остатком напрямую', 'permission denied');
select tst.throws($$update products set stock = 1000 where id = tst.id('p120')$$, 'нельзя изменить остаток напрямую', 'permission denied');
select tst.throws($$update products set avg_cost_tjs = 1 where id = tst.id('p120')$$, 'нельзя изменить себестоимость напрямую', 'permission denied');
select tst.throws($$insert into products (sku, name) values ('bm-120', 'Дубль')$$, 'артикул уникален без учёта регистра', 'duplicate');
select tst.ok((select count(*) from products where name ilike '%мешалка 12%') = 1, 'поиск товара по части названия');

select tst.login('cashier');
select tst.ok((select count(*) from products) = 2, 'кассир видит товары');
select tst.throws($$insert into products (name) values ('Кассир-товар')$$, 'кассир не создаёт товары', 'row-level security');
update products set sale_price = 1 where id = tst.id('p120');
select tst.ok((select sale_price from products where id = tst.id('p120')) = 1200, 'кассир не меняет цену (RLS)');
select tst.ok((select count(*) from stock_movements) = 0 and (select count(*) from stock_arrivals) = 0, 'кассир не видит складские журналы');

-- ---------------------------------------------------------------------------
-- 4. Приход и корректировка
-- ---------------------------------------------------------------------------
select tst.throws($$select create_arrival(('[{"product_id":"' || tst.id('p120') || '","qty":5,"cost":500}]')::jsonb)$$, 'кассир не оформляет приход', 'Недостаточно прав');

select tst.login('warehouse');
select tst.lives($$select create_arrival(
  jsonb_build_array(jsonb_build_object('product_id', tst.id('p120'), 'qty', 10, 'cost', 500),
                    jsonb_build_object('product_id', tst.id('p180'), 'qty', 4, 'cost', 800)),
  'CNY', null, null, 'cash', '[]'::jsonb, 'Контейнер 1', 'Поставщик Иу')$$, 'кладовщик оформляет приход в CNY с оплатой из кассы');
reset role;
select tst.ok((select stock from products where id = tst.id('p120')) = 10, 'остаток после прихода = 10');
select tst.ok((select avg_cost_tjs from products where id = tst.id('p120')) = 800, 'себестоимость = 500 CNY × 1.6 = 800 TJS');
select tst.ok((select total from stock_arrivals) = 8200, 'сумма прихода 10×500 + 4×800 = 8200 CNY');
select tst.ok((select count(*) from cash_transactions where source = 'arrival' and currency = 'CNY' and amount = 8200 and direction = 'out') = 1, 'оплата прихода списана из кассы CNY');
select tst.ok((select count(*) from stock_movements where type = 'arrival') = 2, 'движения склада записаны');

set role authenticated;
select tst.login('warehouse');
select tst.lives($$select create_arrival(jsonb_build_array(jsonb_build_object('product_id', tst.id('p120'), 'qty', 10, 'cost', 1250)), 'TJS', null, null, 'transfer')$$, 'второй приход в TJS (оплата переводом)');
reset role;
select tst.ok((select avg_cost_tjs from products where id = tst.id('p120')) = 1025, 'средняя себестоимость (10×800 + 10×1250)/20 = 1025');
select tst.ok((select stock from products where id = tst.id('p120')) = 20, 'остаток 20');

set role authenticated;
select tst.login('warehouse');
select tst.lives($$select create_adjustment(tst.id('p120'), -2, 'damage', 'Повреждены при разгрузке')$$, 'списание брака');
select tst.throws($$select create_adjustment(tst.id('p120'), -100, 'loss')$$, 'нельзя уйти в минус корректировкой', 'Недостаточно товара');
select tst.throws($$select create_adjustment(tst.id('p120'), 0, 'loss')$$, 'нулевая корректировка запрещена', 'нулевым');
reset role;
select tst.ok((select stock from products where id = tst.id('p120')) = 18, 'остаток после списания 18');

-- ---------------------------------------------------------------------------
-- 5. Клиенты и продажи
-- ---------------------------------------------------------------------------
set role authenticated;
select tst.login('warehouse');
select tst.ok((select count(*) from customers) = 0, 'кладовщик не видит клиентов');
select tst.throws($$insert into customers (name) values ('X')$$, 'кладовщик не создаёт клиентов', 'row-level security');
select tst.throws($$select create_sale(jsonb_build_array(jsonb_build_object('product_id', tst.id('p120'), 'qty', 1)))$$, 'кладовщик не продаёт', 'Недостаточно прав');

select tst.login('cashier');
insert into customers (name, phone) values ('Фирдавс', '+992901112233');
insert into tst.ids select 'cust', id from customers where name = 'Фирдавс';
select tst.ok((select created_by from customers where id = tst.id('cust')) = tst.id('cashier'), 'created_by клиента заполняется автоматически');

-- Продажа за наличные TJS по цене каталога
select tst.lives($$select create_sale(jsonb_build_array(jsonb_build_object('product_id', tst.id('p120'), 'qty', 2)))$$, 'кассир: продажа 2 шт. за наличные');
select tst.ok((select total from sales order by number desc limit 1) = 2400, 'сумма продажи 2 × 1200 = 2400 TJS');
-- Кассир не может переписать цену: price игнорируется
select tst.lives($$select create_sale(jsonb_build_array(jsonb_build_object('product_id', tst.id('p120'), 'qty', 1, 'price', 1)))$$, 'кассир передаёт свою цену');
select tst.ok((select total from sales order by number desc limit 1) = 1200, 'цена кассира проигнорирована, взята цена каталога');
select tst.throws($$select create_sale(jsonb_build_array(jsonb_build_object('product_id', tst.id('p120'), 'qty', 1)), 'TJS', null, 100)$$, 'кассир не даёт скидку', 'Скидку');
select tst.throws($$select create_sale(jsonb_build_array(jsonb_build_object('product_id', tst.id('p120'), 'qty', 1)), 'TJS', null, 0, 500)$$, 'долг без клиента запрещён', 'клиента');
select tst.throws($$select create_sale(jsonb_build_array(jsonb_build_object('product_id', tst.id('p120'), 'qty', 1000)))$$, 'нельзя продать больше остатка', 'Недостаточно товара');
select tst.throws($$select create_sale('[]'::jsonb)$$, 'пустой чек запрещён', 'хотя бы один');
select tst.throws($$insert into sales (subtotal, total) values (1, 1)$$, 'прямая вставка продажи запрещена', 'permission denied');
reset role;
select tst.ok((select stock from products where id = tst.id('p120')) = 15, 'остаток после продаж 18 − 3 = 15');
select tst.ok((select count(*) from stock_movements where type = 'sale') = 2, 'движения продажи записаны');

-- Продажа в долг клиенту в CNY (товар с ценой в TJS переводится по курсу)
set role authenticated;
select tst.login('cashier');
select tst.lives($$select create_sale(jsonb_build_array(jsonb_build_object('product_id', tst.id('p120'), 'qty', 1)), 'CNY', tst.id('cust'), 0, 250, 'cash', 'В долг')$$, 'продажа в CNY с частичной оплатой');
reset role;
select tst.ok((select total = 750 and paid = 250 and debt = 500 and rate = 1.6 from sales order by number desc limit 1), 'CNY: 1200 TJS / 1.6 = 750 CNY, долг 500');
select tst.ok((select balance from customer_balances where customer_id = tst.id('cust') and currency = 'CNY') = 500, 'долг клиента 500 CNY');

-- Менеджер: своя цена и скидка, оплата картой (в кассу не идёт)
set role authenticated;
select tst.login('manager');
select tst.lives($$select create_sale(jsonb_build_array(jsonb_build_object('product_id', tst.id('p180'), 'qty', 1, 'price', 300)), 'TJS', tst.id('cust'), 50, 0, 'card')$$, 'менеджер: своя цена, скидка, полностью в долг');
reset role;
select tst.ok((select subtotal = 300 and discount = 50 and total = 250 and debt = 250 from sales order by number desc limit 1), 'скидка и долг 250 TJS');
select tst.ok((select balance from customer_balances where customer_id = tst.id('cust') and currency = 'TJS') = 250, 'долг клиента 250 TJS');

-- ---------------------------------------------------------------------------
-- 6. Оплата долга, касса
-- ---------------------------------------------------------------------------
set role authenticated;
select tst.login('cashier');
select tst.lives($$select add_customer_payment(tst.id('cust'), 200, 'CNY', 'cash', 'Частичная оплата')$$, 'кассир принимает оплату долга');
select tst.throws($$select add_customer_payment(tst.id('cust'), -5, 'CNY')$$, 'отрицательная оплата запрещена', 'больше нуля');
select tst.ok((select balance from customer_balances where customer_id = tst.id('cust') and currency = 'CNY') = 300, 'долг CNY уменьшился до 300');
select tst.lives($$select add_cash_operation('out', 100, 'TJS', 'Инкассация')$$, 'кассир делает изъятие');
select tst.throws($$select add_cash_operation('in', 100, 'TJS', '')$$, 'операция без комментария запрещена', 'комментарий');
select tst.throws($$insert into cash_transactions (direction, source, currency, amount) values ('in','manual','TJS',1)$$, 'прямая запись в кассу запрещена', 'permission denied');
-- Касса TJS: +2400 +1200 −100 = 3500
select tst.ok((select balance from cash_balances where currency = 'TJS') = 3500, 'баланс кассы TJS = 3500');
-- Касса CNY: −8200 +250 +200 = −7750
select tst.ok((select balance from cash_balances where currency = 'CNY') = -7750, 'баланс кассы CNY = −7750');
select tst.ok((select count(*) from expenses) = 0, 'кассир не видит расходы');
select tst.throws($$select create_expense('Аренда', 100)$$, 'кассир не создаёт расходы', 'Недостаточно прав');
select tst.throws($$select report_summary(now() - interval '1 day', now() + interval '1 day')$$, 'кассир не видит прибыль', 'Недостаточно прав');
select tst.lives($$select * from sales_daily(now() - interval '7 days', now() + interval '1 day')$$, 'кассир видит продажи по дням');

select tst.login('manager');
select tst.throws($$select add_cash_operation('in', 1, 'TJS', 'x')$$, 'менеджер не делает ручных кассовых операций', 'Недостаточно прав');

-- ---------------------------------------------------------------------------
-- 7. Расходы и отчёты
-- ---------------------------------------------------------------------------
select tst.lives($$select create_expense('Аренда', 500, 'TJS', current_date, true, 'Ноябрь')$$, 'менеджер добавляет расход');
reset role;
select tst.ok((select balance from cash_balances where currency = 'TJS') = 3000, 'расход списан из кассы: 3000');

set role authenticated;
select tst.login('owner');
-- Выручка TJS: 2400 + 1200 + 750×1.6=1200 + 250 = 5050
-- Себестоимость: 4 шт × 1025 + 1 × 800×1.6=1280 → 4100 + 1280 = 5380
select tst.ok((select (report_summary(now() - interval '1 day', now() + interval '1 day') ->> 'revenue')::numeric) = 5050, 'выручка 5050 TJS');
select tst.ok((select (report_summary(now() - interval '1 day', now() + interval '1 day') ->> 'cogs')::numeric) = 5380, 'себестоимость 5380 TJS');
select tst.ok((select (report_summary(now() - interval '1 day', now() + interval '1 day') ->> 'net_profit')::numeric) = 5050 - 5380 - 500, 'чистая прибыль = выручка − себестоимость − расходы');
select tst.ok((select (report_summary(now() - interval '1 day', now() + interval '1 day') ->> 'sales_count')::int) = 4, '4 продажи');
select tst.ok((select sum(revenue) from report_daily(now() - interval '6 days', now() + interval '1 day')) = 5050, 'отчёт по дням сходится');
select tst.ok((select count(*) from report_daily(
  (date_trunc('day', now() at time zone 'Asia/Dushanbe') - interval '6 days') at time zone 'Asia/Dushanbe',
  (date_trunc('day', now() at time zone 'Asia/Dushanbe') + interval '1 day') at time zone 'Asia/Dushanbe')) = 7, 'отчёт по дням — 7 строк за неделю (Душанбе)');
select tst.ok((select name from report_top_products(now() - interval '1 day', now() + interval '1 day', 5) limit 1) = 'Бетономешалка 120 л', 'топ товаров');

select tst.login('warehouse');
update products set min_stock = 5 where id = tst.id('p180');
select tst.throws($$select report_top_products(now() - interval '1 day', now() + interval '1 day')$$, 'кладовщик не видит отчёты', 'Недостаточно прав');
select tst.ok((select count(*) from low_stock_products) = 1, 'кладовщик видит товары с низким остатком');

-- ---------------------------------------------------------------------------
-- 8. Отмена продажи
-- ---------------------------------------------------------------------------
select tst.login('manager');
select tst.throws($$select cancel_sale((select id from sales order by number limit 1))$$, 'менеджер не отменяет продажи', 'Недостаточно прав');
select tst.login('admin');
select tst.lives($$select cancel_sale((select id from sales order by number limit 1), 'Возврат')$$, 'админ отменяет первую продажу');
select tst.throws($$select cancel_sale((select id from sales order by number limit 1))$$, 'повторная отмена запрещена', 'уже отменена');
reset role;
select tst.ok((select stock from products where id = tst.id('p120')) = 16, 'остаток вернулся: 14 + 2 = 16');
select tst.ok((select balance from cash_balances where currency = 'TJS') = 600, 'деньги возвращены из кассы: 3000 − 2400 = 600');
select tst.ok((select status from sales order by number limit 1) = 'cancelled', 'статус — отменена');

set role authenticated;
select tst.login('owner');
select tst.ok((select (report_summary(now() - interval '1 day', now() + interval '1 day') ->> 'revenue')::numeric) = 2650, 'отменённая продажа не входит в выручку');
select tst.lives($$select delete_expense((select id from expenses limit 1))$$, 'владелец удаляет расход');
reset role;
select tst.ok((select balance from cash_balances where currency = 'TJS') = 1100, 'удалённый расход возвращён в кассу');

-- ---------------------------------------------------------------------------
-- 9. Отключённый сотрудник и anon
-- ---------------------------------------------------------------------------
set role authenticated;
select tst.login('owner');
select tst.lives($$select set_employee(tst.id('cashier'), 'cashier', false)$$, 'владелец отключает кассира');
select tst.login('cashier');
select tst.ok((select count(*) from sales) = 0, 'отключённый кассир не видит продажи');
select tst.throws($$select create_sale(jsonb_build_array(jsonb_build_object('product_id', tst.id('p120'), 'qty', 1)))$$, 'отключённый кассир не продаёт', 'Недостаточно прав');
reset role;

set role anon;
select tst.login('');
select tst.throws($$select * from products$$, 'anon не читает товары', 'permission denied');
select tst.throws($$select create_sale('[]'::jsonb)$$, 'anon не вызывает функции', 'permission denied');
reset role;

-- Все таблицы public под RLS
select tst.ok((select count(*) from pg_tables where schemaname = 'public' and not rowsecurity) = 0, 'RLS включён на всех таблицах public');
