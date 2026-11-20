# SOHTMON ERP 1.0

Мобильная ERP (PWA) для магазина: склад, продажи, клиенты и долги, касса, расходы,
прибыль и сотрудники. Интерфейс на русском, валюты **TJS** и **CNY**.

**Стек:** Next.js 16 (App Router, Server Actions) · TypeScript · Tailwind CSS 4 · Supabase (Auth + PostgreSQL + RLS) · Recharts · PWA.

План реализации: [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).

## Модули

| # | Модуль | Путь |
|---|---|---|
| 1 | Дашборд (по роли) | `/` |
| 2 | Товары и склад, поиск по названию/артикулу/штрихкоду | `/products` |
| 3 | Категории | `/categories` |
| 4 | Продажи (POS), чеки, история, отмена | `/sales/new`, `/sales` |
| 5 | Приход товара | `/arrivals` |
| 6 | Корректировки остатков | `/adjustments` |
| 7 | Клиенты | `/customers` |
| 8 | Долги и оплаты | `/debts`, `/customers/[id]` |
| 9 | Касса (TJS и CNY) | `/cash` |
| 10 | Расходы | `/expenses` |
| 11 | Прибыль и отчёты | `/reports` |
| 12 | Сотрудники и роли | `/employees` |

## Роли

Owner (Владелец), Admin, Manager, Cashier (Кассир), Warehouse (Кладовщик).
Полная матрица — в `docs/IMPLEMENTATION_PLAN.md` и `src/lib/rbac.ts`.
Права проверяются **в базе данных** (RLS + проверки в SQL-функциях); интерфейс лишь скрывает недоступное.

## Как устроены данные

- Остатки и деньги меняются только SQL-функциями (`create_sale`, `create_arrival`,
  `create_adjustment`, `add_customer_payment`, `cancel_sale`, `create_expense`, …) — атомарно, в одной транзакции.
- Колонки `products.stock` и `avg_cost_tjs` недоступны клиенту для записи.
- Себестоимость — скользящая средняя в TJS; в строке продажи сохраняется себестоимость на момент продажи.
- Каждый денежный документ хранит валюту и курс к TJS; отчёты считаются в TJS. Курс CNY задаётся в «Настройках».
- В кассу попадают только наличные операции (продажи и оплаты картой/переводом в кассу не идут).
- Отчёты по дням считаются по времени Душанбе (UTC+5).

## Установка

1. Создайте проект на [supabase.com](https://supabase.com).
2. Примените миграции **по порядку** из `supabase/migrations/`:
   - **проще всего:** вставьте весь файл `supabase/setup.sql` в SQL Editor и нажмите Run, или
   - через Supabase CLI: `supabase link --project-ref <ref> && supabase db push`.
3. В Supabase → Authentication → Providers включите Email. Для быстрого старта можно отключить «Confirm email».
4. Скопируйте `.env.example` в `.env.local` и заполните ключи.
5. Запуск:
   ```bash
   npm install
   npm run dev        # http://localhost:3000
   ```
6. Зарегистрируйтесь на `/register` — **первый пользователь автоматически становится владельцем**.
   Следующие регистрации неактивны, пока владелец/админ не назначит роль в «Сотрудниках»
   (или владелец создаёт аккаунты сам, если задан `SUPABASE_SECRET_KEY`).

> Переменные `NEXT_PUBLIC_*` встраиваются при сборке — после их изменения пересоберите проект.

## Деплой (Vercel)

Импортируйте репозиторий в Vercel, добавьте переменные окружения из `.env.example`, задеплойте.
На iPhone: Safari → «Поделиться» → «На экран Домой». На Samsung/Android: Chrome → «Установить приложение».

## Проверки

```bash
npm run typecheck
npm run lint
npm run build
# SQL-тесты (106 проверок: роли, RLS, остатки, долги, касса, прибыль, отмена).
# Нужен локальный PostgreSQL 14+; Supabase эмулируется файлом supabase/tests/00_supabase_shim.sql
PGHOST=localhost PGUSER=postgres npm run test:db
```

## Структура

```
src/app/(app)/…        модули (серверные страницы + server actions)
src/app/login|register вход и регистрация
src/components/        UI-кит, навигация, графики
src/lib/               Supabase-клиенты, авторизация, RBAC, форматирование
src/proxy.ts           обновление сессии, защита маршрутов
supabase/migrations/   схема, функции, RLS
supabase/tests/        SQL-тесты
public/sw.js           service worker (офлайн-страница, кэш статики)
legacy/                предыдущая статическая страница заказа
```
