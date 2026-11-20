-- SOHTMON ERP 2.0-a — тесты: поставщики, долги поставщикам, полная себестоимость.
-- Выполняется после 10_erp.sql (использует его помощники и пользователей). Курс CNY = 1.6.
\set ON_ERROR_STOP 1

set role authenticated;
select tst.login('warehouse');
select tst.lives($$insert into suppliers (name, phone, country) values ('Завод Иу', '+86 579 0000', 'Китай')$$, 'кладовщик добавляет поставщика');
select tst.throws($$insert into suppliers (name) values ('завод иу')$$, 'название поставщика уникально', 'duplicate');
reset role;
insert into tst.ids select 'sup', id from suppliers where name = 'Завод Иу';

set role authenticated;
select tst.login('warehouse');
insert into products (sku, name, sale_price, sale_currency, purchase_currency) values ('MIX-1', 'Миксер строительный', 1000, 'TJS', 'CNY');
reset role;
insert into tst.ids select 'mix', id from products where sku = 'MIX-1';
-- обнулим остаток p180 не трогая — используем его текущую себестоимость для проверки скользящей средней
create temp table t_before as select id, stock, avg_cost_tjs from products where id = tst.id('p180');
grant select on t_before to authenticated;

-- Приход: поставщик, 2 товара, доставка 520 TJS (из кассы) + таможня ¥100 (не из кассы), оплачено ¥500 переводом
set role authenticated;
select tst.login('warehouse');
select tst.lives($$select create_arrival(
  jsonb_build_array(jsonb_build_object('product_id', tst.id('mix'), 'qty', 10, 'cost', 100),
                    jsonb_build_object('product_id', tst.id('p180'), 'qty', 5, 'cost', 60)),
  'CNY', tst.id('sup'), 500, 'transfer',
  jsonb_build_array(jsonb_build_object('name', 'Доставка', 'amount', 520, 'currency', 'TJS', 'paid_from_cash', true),
                    jsonb_build_object('name', 'Таможня', 'amount', 100, 'currency', 'CNY', 'paid_from_cash', false)),
  'Контейнер 2')$$, 'приход с поставщиком, частичной оплатой и доп. расходами');
reset role;
insert into tst.ids select 'arr2', id from stock_arrivals where note = 'Контейнер 2';

select tst.ok((select total from stock_arrivals where id = tst.id('arr2')) = 1300, 'сумма прихода 10×100 + 5×60 = ¥1300');
select tst.ok((select supplier = 'Завод Иу' and supplier_id = tst.id('sup') from stock_arrivals where id = tst.id('arr2')), 'приход привязан к поставщику');
select tst.ok((select extra_costs_tjs from stock_arrivals where id = tst.id('arr2')) = 680, 'доп. расходы 520 + 100×1.6 = 680 TJS');
-- Доля миксера: 680 × 1600/2080 = 523.0769 → на 1 шт 52.3077; себестоимость 160 + 52.3077
select tst.ok((select landed_unit_cost_tjs from stock_arrival_items where arrival_id = tst.id('arr2') and product_id = tst.id('mix')) = 212.3077,
  'себестоимость миксера с доставкой и таможней = 212.3077 TJS');
select tst.ok((select avg_cost_tjs from products where id = tst.id('mix')) = 212.3077, 'средняя себестоимость нового товара = полной себестоимости');
select tst.ok((select landed_unit_cost_tjs from stock_arrival_items where arrival_id = tst.id('arr2') and product_id = tst.id('p180')) = 127.3846,
  'p180: 96 + 680×480/2080/5 = 127.3846 TJS');
select tst.ok((select p.avg_cost_tjs = round((b.stock * b.avg_cost_tjs + 5 * 127.3846) / (b.stock + 5), 4)
                 from products p join t_before b on b.id = p.id), 'скользящая средняя учитывает полную себестоимость');
select tst.ok((select sum(qty_delta) from stock_movements where ref_id = tst.id('arr2')) = 15, 'остатки увеличены на 15');
select tst.ok((select count(*) from stock_arrival_costs where arrival_id = tst.id('arr2')) = 2, 'доп. расходы записаны');
select tst.ok((select count(*) = 1 and sum(amount) = 520 from cash_transactions where ref_id = tst.id('arr2') and direction = 'out' and currency = 'TJS'),
  'из кассы выдана только доставка 520 TJS');
select tst.ok((select count(*) from cash_transactions where ref_id = tst.id('arr2') and currency = 'CNY') = 0, 'оплата переводом и таможня не из кассы — касса CNY не тронута');
select tst.ok((select count(*) = 1 and sum(amount) = 500 from supplier_payments where arrival_id = tst.id('arr2')), 'оплата ¥500 при приходе записана');

-- Видимость и долг
set role authenticated;
select tst.login('warehouse');
select tst.ok((select count(*) from suppliers) = 1, 'кладовщик видит поставщиков');
select tst.ok((select count(*) from supplier_payments) = 0, 'кладовщик не видит оплаты поставщикам');
select tst.throws($$select add_supplier_payment(tst.id('sup'), 100, 'CNY')$$, 'кладовщик не платит поставщикам', 'Недостаточно прав');
delete from suppliers where id = tst.id('sup');
reset role;
select tst.ok((select count(*) from suppliers where id = tst.id('sup')) = 1, 'поставщик не удалён кладовщиком (RLS)');

set role authenticated;
select tst.login('manager');
select tst.ok((select balance from supplier_balances where supplier_id = tst.id('sup') and currency = 'CNY') = 800, 'наш долг поставщику ¥800');
select tst.lives($$select add_supplier_payment(tst.id('sup'), 300, 'CNY', 'cash', 'Частично')$$, 'менеджер платит поставщику ¥300 наличными');
select tst.ok((select balance from supplier_balances where supplier_id = tst.id('sup') and currency = 'CNY') = 500, 'долг поставщику уменьшился до ¥500');
select tst.throws($$select add_supplier_payment(tst.id('sup'), 0, 'CNY')$$, 'нулевая оплата запрещена', 'больше нуля');
reset role;
select tst.ok((select count(*) from cash_transactions where source = 'supplier_payment' and currency = 'CNY' and amount = 300 and direction = 'out') = 1,
  'оплата наличными списана из кассы CNY');

-- Ошибки ввода
set role authenticated;
select tst.login('warehouse');
select tst.throws($$select create_arrival(jsonb_build_array(jsonb_build_object('product_id', tst.id('mix'), 'qty', 1, 'cost', 100)), 'CNY', null, 10)$$,
  'долг без поставщика запрещён', 'выберите поставщика');
select tst.throws($$select create_arrival(jsonb_build_array(jsonb_build_object('product_id', tst.id('mix'), 'qty', 1, 'cost', 100)), 'CNY', tst.id('sup'), 999)$$,
  'оплата больше суммы прихода запрещена', 'от 0 до');
select tst.throws($$select create_arrival(jsonb_build_array(jsonb_build_object('product_id', tst.id('mix'), 'qty', 1, 'cost', 100)), 'CNY', tst.id('sup'), 0, 'cash',
  jsonb_build_array(jsonb_build_object('name', 'X', 'amount', -5)))$$, 'отрицательный доп. расход запрещён', 'отрицательной');
-- Приход полностью в долг, без доп. расходов: средняя = цена × курс
select tst.lives($$select create_arrival(jsonb_build_array(jsonb_build_object('product_id', tst.id('mix'), 'qty', 10, 'cost', 150)), 'CNY', tst.id('sup'), 0)$$,
  'приход полностью в долг');
reset role;
select tst.ok((select avg_cost_tjs from products where id = tst.id('mix')) = round((10 * 212.3077 + 10 * 240) / 20, 4), 'средняя (212.3077 + 240)/2');

set role authenticated;
select tst.login('owner');
select tst.ok((select balance from supplier_balances where supplier_id = tst.id('sup') and currency = 'CNY') = 2000, 'долг поставщику ¥500 + ¥1500 = ¥2000');
select tst.lives($$select set_employee(tst.id('cashier'), 'cashier', true)$$, 'кассир снова активен');
select tst.login('cashier');
select tst.ok((select count(*) from suppliers) = 0, 'кассир не видит поставщиков');
select tst.ok((select count(*) from supplier_balances) = 0, 'кассир не видит долги поставщикам');
select tst.throws($$insert into suppliers (name) values ('Кассир-поставщик')$$, 'кассир не создаёт поставщиков', 'row-level security');
select tst.throws($$insert into supplier_payments (supplier_id, currency, amount) values (tst.id('sup'), 'CNY', 1)$$, 'прямая запись оплаты запрещена', 'permission denied');
reset role;

set role anon;
select tst.login('');
select tst.throws($$select * from suppliers$$, 'anon не читает поставщиков', 'permission denied');
reset role;
select tst.ok((select count(*) from pg_tables where schemaname = 'public' and not rowsecurity) = 0, 'RLS включён на всех таблицах (2.0)');
