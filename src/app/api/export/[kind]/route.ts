import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { can, type Permission } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { buildWorkbook, type Sheet } from "@/lib/excel";
import { isoDay, PAYMENT_LABEL, periodRange, presetPeriod } from "@/lib/format";
import type { PaymentMethod } from "@/lib/types";

const KINDS: Record<string, { perm: Permission; file: string }> = {
  sales: { perm: "sales.view", file: "prodazhi" },
  products: { perm: "products.view", file: "tovary" },
  debts: { perm: "customers.view", file: "dolgi" },
  expenses: { perm: "expenses.view", file: "rashody" },
  cash: { perm: "cash.view", file: "kassa" },
  report: { perm: "reports.view", file: "otchet" },
};

const isDay = (v: string | null) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
const sum = (rows: Record<string, unknown>[], k: string) => Math.round(rows.reduce((s, r) => s + Number(r[k] ?? 0), 0) * 100) / 100;

export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const spec = KINDS[kind];
  if (!spec) return new Response("Неизвестный отчёт", { status: 404 });
  const profile = await getSession();
  if (!profile) return new Response("Требуется вход", { status: 401 });
  if (!profile.is_active || !can(profile.role, spec.perm)) return new Response("Недостаточно прав", { status: 403 });

  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const period = isDay(from) && isDay(to) ? { from: from!, to: to!, label: `${from} — ${to}` } : presetPeriod(sp.get("p") ?? "30d");
  const range = periodRange(period.from, period.to);
  const supabase = await createClient();
  const showCost = can(profile.role, "products.cost");
  let sheets: Sheet[] = [];

  if (kind === "sales") {
    const { data, error } = await supabase
      .from("sales")
      .select("number, created_at, currency, rate, subtotal, discount, total, paid, debt, payment_method, status, note, customers(name, phone), profiles:created_by(full_name)")
      .gte("created_at", range.start)
      .lt("created_at", range.end)
      .order("created_at")
      .limit(10000);
    if (error) return new Response(error.message, { status: 500 });
    const rows = (data ?? []).map((s) => {
      const r = s as unknown as Record<string, unknown> & { customers: { name: string; phone: string | null } | null; profiles: { full_name: string } | null };
      return {
        ...r,
        customer: r.customers?.name ?? "Розница",
        phone: r.customers?.phone ?? "",
        seller: r.profiles?.full_name ?? "",
        method: PAYMENT_LABEL[r.payment_method as PaymentMethod],
        status_ru: r.status === "cancelled" ? "Отменена" : "Проведена",
        total_tjs: r.status === "cancelled" ? 0 : Number(r.total) * Number(r.rate),
      };
    });
    sheets = [
      {
        name: "Продажи",
        title: `Продажи · ${period.label}`,
        columns: [
          { header: "№", key: "number", type: "int", width: 8 },
          { header: "Дата", key: "created_at", type: "date" },
          { header: "Клиент", key: "customer", width: 24 },
          { header: "Телефон", key: "phone", width: 16 },
          { header: "Валюта", key: "currency", width: 8 },
          { header: "Сумма", key: "subtotal", type: "money" },
          { header: "Скидка", key: "discount", type: "money" },
          { header: "Итого", key: "total", type: "money" },
          { header: "Оплачено", key: "paid", type: "money" },
          { header: "Долг", key: "debt", type: "money" },
          { header: "Итого в TJS", key: "total_tjs", type: "money" },
          { header: "Оплата", key: "method", width: 12 },
          { header: "Статус", key: "status_ru", width: 12 },
          { header: "Продавец", key: "seller", width: 20 },
          { header: "Примечание", key: "note", width: 28 },
        ],
        rows,
        totals: { total_tjs: sum(rows, "total_tjs") },
      },
    ];
  }

  if (kind === "products") {
    const { data, error } = await supabase
      .from("products")
      .select("sku, barcode, name, unit, stock, min_stock, sale_price, sale_currency, purchase_price, purchase_currency, avg_cost_tjs, is_active, categories(name)")
      .order("name")
      .limit(10000);
    if (error) return new Response(error.message, { status: 500 });
    const rows = (data ?? []).map((p) => {
      const r = p as unknown as Record<string, unknown> & { categories: { name: string } | null };
      return {
        ...r,
        category: r.categories?.name ?? "",
        active: r.is_active ? "Да" : "Нет",
        low: Number(r.stock) <= Number(r.min_stock) ? "Мало" : "",
        value_tjs: Math.max(Number(r.stock), 0) * Number(r.avg_cost_tjs),
      };
    });
    sheets = [
      {
        name: "Товары и остатки",
        title: `Товары и остатки на ${isoDay()}`,
        columns: [
          { header: "Артикул", key: "sku", width: 12 },
          { header: "Штрихкод", key: "barcode", width: 16 },
          { header: "Название", key: "name", width: 32 },
          { header: "Категория", key: "category", width: 18 },
          { header: "Ед.", key: "unit", width: 6 },
          { header: "Остаток", key: "stock", type: "qty", width: 10 },
          { header: "Мин.", key: "min_stock", type: "qty", width: 8 },
          { header: "", key: "low", width: 7 },
          { header: "Цена продажи", key: "sale_price", type: "money" },
          { header: "Вал.", key: "sale_currency", width: 6 },
          ...(showCost
            ? ([
                { header: "Закупка", key: "purchase_price", type: "money" },
                { header: "Вал.", key: "purchase_currency", width: 6 },
                { header: "Себестоимость TJS", key: "avg_cost_tjs", type: "money" },
                { header: "Стоимость остатка TJS", key: "value_tjs", type: "money", width: 18 },
              ] as Sheet["columns"])
            : []),
          { header: "Активен", key: "active", width: 9 },
        ],
        rows,
        totals: showCost ? { value_tjs: sum(rows, "value_tjs") } : undefined,
      },
    ];
  }

  if (kind === "debts") {
    const [{ data: balances }, { data: customers }] = await Promise.all([
      supabase.from("customer_balances").select("*").gt("balance", 0).order("balance", { ascending: false }),
      supabase.from("customers").select("id, name, phone, address"),
    ]);
    const byId = new Map((customers ?? []).map((c) => [c.id, c]));
    const rows = (balances ?? []).map((b) => ({ ...b, ...byId.get(b.customer_id) }));
    sheets = (["TJS", "CNY"] as const).map((cur) => {
      const part = rows.filter((r) => r.currency === cur);
      return {
        name: `Долги ${cur}`,
        title: `Долги клиентов (${cur}) на ${isoDay()}`,
        columns: [
          { header: "Клиент", key: "name", width: 28 },
          { header: "Телефон", key: "phone", width: 16 },
          { header: "Адрес", key: "address", width: 24 },
          { header: "Всего в долг", key: "total_debt", type: "money" },
          { header: "Оплачено", key: "total_paid", type: "money" },
          { header: "Остаток долга", key: "balance", type: "money" },
        ],
        rows: part,
        totals: { balance: sum(part, "balance") },
      } satisfies Sheet;
    });
  }

  if (kind === "expenses") {
    const { data, error } = await supabase
      .from("expenses")
      .select("expense_date, category, amount, currency, rate, paid_from_cash, note, profiles:created_by(full_name)")
      .gte("expense_date", period.from)
      .lte("expense_date", period.to)
      .order("expense_date")
      .limit(10000);
    if (error) return new Response(error.message, { status: 500 });
    const rows = (data ?? []).map((e) => {
      const r = e as unknown as Record<string, unknown> & { profiles: { full_name: string } | null };
      return { ...r, amount_tjs: Number(r.amount) * Number(r.rate), cash: r.paid_from_cash ? "Да" : "Нет", who: r.profiles?.full_name ?? "" };
    });
    sheets = [
      {
        name: "Расходы",
        title: `Расходы · ${period.label}`,
        columns: [
          { header: "Дата", key: "expense_date", width: 12 },
          { header: "Категория", key: "category", width: 22 },
          { header: "Сумма", key: "amount", type: "money" },
          { header: "Валюта", key: "currency", width: 8 },
          { header: "Сумма в TJS", key: "amount_tjs", type: "money" },
          { header: "Из кассы", key: "cash", width: 9 },
          { header: "Комментарий", key: "note", width: 30 },
          { header: "Сотрудник", key: "who", width: 20 },
        ],
        rows,
        totals: { amount_tjs: sum(rows, "amount_tjs") },
      },
    ];
  }

  if (kind === "cash") {
    const { data, error } = await supabase
      .from("cash_transactions")
      .select("created_at, direction, source, currency, amount, note, profiles:created_by(full_name)")
      .gte("created_at", range.start)
      .lt("created_at", range.end)
      .order("created_at")
      .limit(20000);
    if (error) return new Response(error.message, { status: 500 });
    const SRC: Record<string, string> = { sale: "Продажа", sale_cancel: "Отмена продажи", debt_payment: "Оплата долга", expense: "Расход", arrival: "Оплата прихода", manual: "Ручная" };
    const rows = (data ?? []).map((t) => {
      const r = t as unknown as Record<string, unknown> & { profiles: { full_name: string } | null };
      return {
        ...r,
        currency: String(r.currency),
        in: r.direction === "in" ? Number(r.amount) : "",
        out: r.direction === "out" ? Number(r.amount) : "",
        src: SRC[String(r.source)] ?? r.source,
        who: r.profiles?.full_name ?? "",
      };
    });
    sheets = (["TJS", "CNY"] as const).map((cur) => {
      const part = rows.filter((r) => r.currency === cur);
      return {
        name: `Касса ${cur}`,
        title: `Касса ${cur} · ${period.label}`,
        columns: [
          { header: "Дата", key: "created_at", type: "date" },
          { header: "Операция", key: "src", width: 16 },
          { header: "Приход", key: "in", type: "money" },
          { header: "Расход", key: "out", type: "money" },
          { header: "Комментарий", key: "note", width: 34 },
          { header: "Сотрудник", key: "who", width: 20 },
        ],
        rows: part,
        totals: { in: sum(part, "in"), out: sum(part, "out") },
      } satisfies Sheet;
    });
  }

  if (kind === "report") {
    const [{ data: summary }, { data: daily }, { data: top }] = await Promise.all([
      supabase.rpc("report_summary", { p_from: range.start, p_to: range.end }),
      supabase.rpc("report_daily", { p_from: range.start, p_to: range.end }),
      supabase.rpc("report_top_products", { p_from: range.start, p_to: range.end, p_limit: 50 }),
    ]);
    const s = (summary ?? {}) as Record<string, number>;
    const LABELS: [string, string][] = [
      ["revenue", "Выручка"],
      ["cogs", "Себестоимость"],
      ["gross_profit", "Валовая прибыль"],
      ["expenses", "Расходы"],
      ["net_profit", "Чистая прибыль"],
      ["sales_count", "Количество продаж"],
      ["avg_check", "Средний чек"],
      ["discounts", "Скидки"],
      ["new_debt", "Продано в долг"],
    ];
    const dailyRows = ((daily ?? []) as Record<string, unknown>[]).filter((d) => Number(d.sales_count) > 0 || Number(d.expenses) > 0);
    sheets = [
      {
        name: "Итоги",
        title: `Прибыль и отчёт · ${period.label} (TJS)`,
        columns: [
          { header: "Показатель", key: "label", width: 26 },
          { header: "Значение", key: "value", type: "money", width: 16 },
        ],
        rows: LABELS.map(([k, label]) => ({ label, value: s[k] ?? 0 })),
      },
      {
        name: "По дням",
        columns: [
          { header: "День", key: "day", width: 12 },
          { header: "Продаж", key: "sales_count", type: "int", width: 9 },
          { header: "Выручка", key: "revenue", type: "money" },
          { header: "Валовая прибыль", key: "profit", type: "money", width: 16 },
          { header: "Расходы", key: "expenses", type: "money" },
        ],
        rows: dailyRows,
        totals: { revenue: sum(dailyRows, "revenue"), profit: sum(dailyRows, "profit"), expenses: sum(dailyRows, "expenses") },
      },
      {
        name: "Топ товаров",
        columns: [
          { header: "Товар", key: "name", width: 32 },
          { header: "Кол-во", key: "qty", type: "qty", width: 10 },
          { header: "Выручка TJS", key: "revenue", type: "money" },
          { header: "Прибыль TJS", key: "profit", type: "money" },
        ],
        rows: (top ?? []) as Record<string, unknown>[],
      },
    ];
  }

  const buf = await buildWorkbook(sheets);
  const filename = `sohtmon-${spec.file}-${isoDay()}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
