-- SOHTMON ERP 2.0-b — тесты: частичный возврат по чеку, смены кассира.
-- Выполняется после 10_erp.sql и 20_v2_suppliers.sql.
\set ON_ERROR_STOP 1

-- Исходные показатели
set role authenticated;
select tst.login('owner');
create temp table t0 as
select (report_summary(now() - interval '1 day', now() + interval '1 day') ->> 'revenue')::numeric as revenue,
       (report_summary(now() - interval '1 day', now() + interval '1 day') ->> 'cogs')::numeric as cogs,
       coalesce((select balance from customer_balances where customer_id = tst.id('cust') and currency = 'TJS'), 0) as cust_tjs;
reset role;
grant select on t0 to authenticated;
insert into tst.ids select 'mixstock', id from products where sku = 'MIX-1';
create temp table t_stock as select stock from products where sku = 'MIX-1';
grant select on t_stock to authenticated;

-- Продажа: 4 × 1000 со скидкой 400 (итого 3600), оплачено 1000, долг 2600
set role authenticated;
select tst.login('manager');
select tst.lives($$select create_sale(jsonb_build_array(jsonb_build_object('product_id', tst.id('mix'), 'qty', 4, 'price', 1000)),
  'TJS', tst.id('cust'), 400, 1000, 'cash', 'Для возврата')$$, 'продажа со скидкой и долгом');
reset role;
insert into tst.ids select 'rs', id from sales where note = 'Для возврата';
insert into tst.ids select 'rs_item', id from sale_items where sale_id = tst.id('rs');

set role authenticated;
select tst.login('cashier');
select tst.throws($$select return_sale_items(tst.id('rs'), jsonb_build_array(jsonb_build_object('sale_item_id', tst.id('rs_item'), 'qty', 1)), 'cash', 'брак')$$,
  'кассир не оформляет возврат', 'Недостаточно прав');

select tst.login('manager');
select tst.throws($$select return_sale_items(tst.id('rs'), jsonb_build_array(jsonb_build_object('sale_item_id', tst.id('rs_item'), 'qty', 1)), 'cash', '')$$,
  'возврат без причины запрещён', 'причину');
select tst.lives($$select return_sale_items(tst.id('rs'), jsonb_build_array(jsonb_build_object('sale_item_id', tst.id('rs_item'), 'qty', 1)), 'cash', 'Брак')$$,
  'возврат 1 шт.');
reset role;
select tst.ok((select total = 900 and debt_reduction = 900 and refund_amount = 0 from sale_returns where sale_id = tst.id('rs') order by number limit 1),
  'возврат 1 × 1000 × 0.9 = 900 — целиком уменьшает долг, деньги не выдаются');
select tst.ok((select stock from products where sku = 'MIX-1') = (select stock from t_stock) - 3, 'остаток: продано 4, возвращено 1');
select tst.ok((select balance from customer_balances where customer_id = tst.id('cust') and currency = 'TJS') = (select cust_tjs from t0) + 2600 - 900,
  'долг клиента уменьшился на 900');
select tst.ok((select count(*) from cash_transactions where source = 'sale_return') = 0, 'касса не тронута');

set role authenticated;
select tst.login('manager');
select tst.lives($$select return_sale_items(tst.id('rs'), jsonb_build_array(jsonb_build_object('sale_item_id', tst.id('rs_item'), 'qty', 3)), 'cash', 'Клиент передумал')$$,
  'возврат остальных 3 шт.');
reset role;
select tst.ok((select total = 2700 and debt_reduction = 1700 and refund_amount = 1000 from sale_returns where sale_id = tst.id('rs') order by number desc limit 1),
  'возврат 2700: долг −1700 (остаток долга), наличными 1000');
select tst.ok((select count(*) = 1 and sum(amount) = 1000 from cash_transactions where source = 'sale_return' and direction = 'out' and currency = 'TJS'),
  'из кассы выдано 1000 TJS');
select tst.ok((select balance from customer_balances where customer_id = tst.id('cust') and currency = 'TJS') = (select cust_tjs from t0),
  'долг клиента по чеку погашен полностью');
select tst.ok((select stock from products where sku = 'MIX-1') = (select stock from t_stock), 'остаток вернулся полностью');

set role authenticated;
select tst.login('manager');
select tst.throws($$select return_sale_items(tst.id('rs'), jsonb_build_array(jsonb_build_object('sale_item_id', tst.id('rs_item'), 'qty', 1)), 'cash', 'ещё')$$,
  'нельзя вернуть больше проданного', 'больше, чем продано');
select tst.login('owner');
select tst.throws($$select cancel_sale(tst.id('rs'), 'x')$$, 'отмена чека с возвратом запрещена', 'уже есть возврат');
select tst.ok((select (report_summary(now() - interval '1 day', now() + interval '1 day') ->> 'revenue')::numeric) = (select revenue from t0),
  'выручка: продажа 3600 − возвраты 3600 = без изменений');
select tst.ok((select (report_summary(now() - interval '1 day', now() + interval '1 day') ->> 'cogs')::numeric) = (select cogs from t0),
  'себестоимость возвращённого товара вычтена');
select tst.ok((select (report_summary(now() - interval '1 day', now() + interval '1 day') ->> 'returns')::numeric) >= 3600, 'отчёт показывает сумму возвратов');
select tst.ok((select sum(revenue) from report_daily(now() - interval '1 day', now() + interval '1 day'))
             = (select (report_summary(now() - interval '1 day', now() + interval '1 day') ->> 'revenue')::numeric), 'отчёт по дням сходится с итогом');
select tst.ok(coalesce((select qty from report_top_products(now() - interval '1 day', now() + interval '1 day', 50) where product_id = tst.id('mix')), 0) = 0,
  'топ товаров: продано минус возвращено = 0');

-- Возврат с выплатой картой (касса не трогается)
select tst.lives($$select create_sale(jsonb_build_array(jsonb_build_object('product_id', tst.id('mix'), 'qty', 2)), 'TJS', null, 0, null, 'cash', 'Карта-возврат')$$, 'продажа 2 шт. за наличные');
reset role;
insert into tst.ids select 'rs2_item', i.id from sale_items i join sales s on s.id = i.sale_id where s.note = 'Карта-возврат';
insert into tst.ids select 'rs2', id from sales where note = 'Карта-возврат';
set role authenticated;
select tst.login('admin');
select tst.lives($$select return_sale_items(tst.id('rs2'), jsonb_build_array(jsonb_build_object('sale_item_id', tst.id('rs2_item'), 'qty', 1)), 'card', 'Возврат на карту')$$,
  'возврат 1 шт. на карту');
reset role;
select tst.ok((select refund_amount = 1000 and refund_method = 'card' from sale_returns where sale_id = tst.id('rs2')), 'на карту возвращено 1000');
select tst.ok((select count(*) from cash_transactions where source = 'sale_return' and ref_id in (select id from sale_returns where sale_id = tst.id('rs2'))) = 0,
  'возврат на карту не уменьшает кассу');

-- ---------------------------------------------------------------------------
-- Смены
-- ---------------------------------------------------------------------------
select public._cash_balance('TJS') as bal_tjs, public._cash_balance('CNY') as bal_cny \gset
set role authenticated;
select tst.login('warehouse');
select tst.throws($$select open_shift(0, 0)$$, 'кладовщик не открывает смену', 'Недостаточно прав');
select tst.ok((select count(*) from cash_shifts) = 0, 'кладовщик не видит смены');
select tst.login('cashier');
select tst.throws($$select close_shift(0, 0)$$, 'нельзя закрыть несуществующую смену', 'Нет открытой смены');
select tst.lives(format($$select open_shift(%s, 10, 'Утро')$$, :'bal_tjs'), 'кассир открывает смену (TJS сходится, в CNY фактически ¥10)');
select tst.throws($$select open_shift(0, 0)$$, 'вторую смену открыть нельзя', 'уже открыта');
reset role;
select tst.ok((select count(*) = 1 and sum(amount) = abs(10 - (:'bal_cny')::numeric) from cash_transactions where source = 'shift_diff' and currency = 'CNY'),
  'расхождение CNY при открытии проведено корректировкой');
select tst.ok((select count(*) from cash_transactions where source = 'shift_diff' and currency = 'TJS') = 0, 'TJS сошлось — корректировки нет');
select tst.ok(public._cash_balance('CNY') = 10, 'касса CNY = пересчитанной сумме ¥10');

set role authenticated;
select tst.login('cashier');
select tst.lives($$select create_sale(jsonb_build_array(jsonb_build_object('product_id', tst.id('mix'), 'qty', 1)), 'TJS', null, 0, null, 'cash', 'В смене')$$, 'продажа в смене');
select tst.ok((select (shift_summary(id) -> 'sales' -> 0 ->> 'total')::numeric = 1000 and (shift_summary(id) -> 'sales' -> 0 ->> 'count')::int = 1
                 from cash_shifts where closed_at is null), 'сводка смены: 1 продажа на 1000');
select tst.lives(format($$select close_shift(%s, 10, 'Недостача')$$, (:'bal_tjs')::numeric + 1000 - 50), 'закрытие смены с недостачей 50 TJS');
select tst.throws($$select close_shift(0, 0)$$, 'повторно закрыть нельзя', 'Нет открытой смены');
reset role;
select tst.ok((select expected_tjs = (:'bal_tjs')::numeric + 1000 and counted_tjs = (:'bal_tjs')::numeric + 950 from cash_shifts order by number desc limit 1),
  'смена: ожидалось и посчитано записаны');
select tst.ok((select count(*) = 1 and sum(amount) = 50 from cash_transactions where source = 'shift_diff' and currency = 'TJS' and direction = 'out'),
  'недостача 50 TJS проведена');
select tst.ok(public._cash_balance('TJS') = (:'bal_tjs')::numeric + 950, 'касса TJS = пересчитанной сумме');

set role authenticated;
select tst.login('manager');
select tst.ok((select count(*) from cash_shifts) = 1, 'менеджер видит смены');
select tst.throws($$select open_shift(0, 0)$$, 'менеджер не открывает смену', 'Недостаточно прав');
select tst.throws($$select _cash_balance('TJS')$$, '_cash_balance недоступна напрямую', 'permission denied');
reset role;
select tst.ok((select count(*) from pg_tables where schemaname = 'public' and not rowsecurity) = 0, 'RLS включён на всех таблицах (2.0-b)');
