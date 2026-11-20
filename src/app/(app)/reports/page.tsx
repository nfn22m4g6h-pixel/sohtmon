import type { Metadata } from "next";
import { Banknote, Coins, Percent, ReceiptText, ShoppingBag, TrendingUp } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { money, num, periodRange, presetPeriod, qty, shortDay } from "@/lib/format";
import { Button, Card, CardHeader, Chips, EmptyState, Input, PageHeader, StatCard } from "@/components/ui";
import { HBarChart, SERIES, TrendChart } from "@/components/charts";

export const metadata: Metadata = { title: "Прибыль и отчёты" };

type Summary = { revenue: number; cogs: number; gross_profit: number; expenses: number; net_profit: number; sales_count: number; avg_check: number; discounts: number; new_debt: number };
type Daily = { day: string; revenue: number; profit: number; expenses: number; sales_count: number };
type Top = { product_id: string; name: string; qty: number; revenue: number; profit: number };

const isDay = (v?: string) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ p?: string; from?: string; to?: string }> }) {
  await requirePermission("reports.view");
  const sp = await searchParams;
  const custom = isDay(sp.from) && isDay(sp.to) && sp.from! <= sp.to!;
  const period = custom ? { from: sp.from!, to: sp.to!, label: `${shortDay(sp.from!)} – ${shortDay(sp.to!)}` } : presetPeriod(sp.p ?? "30d");
  const range = periodRange(period.from, period.to);
  const supabase = await createClient();
  const days = Math.round((new Date(range.end).getTime() - new Date(range.start).getTime()) / 86_400_000);

  const [{ data: summary }, { data: daily }, { data: top }, { data: expenses }] = await Promise.all([
    supabase.rpc("report_summary", { p_from: range.start, p_to: range.end }),
    days <= 370 ? supabase.rpc("report_daily", { p_from: range.start, p_to: range.end }) : Promise.resolve({ data: [] }),
    supabase.rpc("report_top_products", { p_from: range.start, p_to: range.end, p_limit: 10 }),
    supabase.from("expenses").select("category, amount, rate").gte("expense_date", period.from).lte("expense_date", period.to),
  ]);
  const s = (summary ?? {}) as Summary;
  const d = ((daily ?? []) as Daily[]).map((x) => ({ ...x, revenue: Number(x.revenue), profit: Number(x.profit), expenses: Number(x.expenses) }));
  const t = (top ?? []) as Top[];
  const byCat = new Map<string, number>();
  (expenses ?? []).forEach((e) => byCat.set(e.category, (byCat.get(e.category) ?? 0) + Number(e.amount) * Number(e.rate)));
  const expChart = [...byCat.entries()].map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 })).sort((a, b) => b.value - a.value);
  const margin = Number(s.revenue) > 0 ? (Number(s.gross_profit) / Number(s.revenue)) * 100 : 0;

  return (
    <div>
      <PageHeader title="Прибыль и отчёты" subtitle={`${period.label} · все суммы в TJS`} />
      <Chips
        active={custom ? "custom" : (sp.p ?? "30d")}
        items={[
          { key: "today", label: "Сегодня", href: "/reports?p=today" },
          { key: "7d", label: "7 дней", href: "/reports?p=7d" },
          { key: "30d", label: "30 дней", href: "/reports?p=30d" },
          { key: "month", label: "Этот месяц", href: "/reports?p=month" },
          { key: "all", label: "Всё время", href: "/reports?p=all" },
        ]}
      />
      <form className="mb-4 flex flex-wrap items-end gap-2" action="/reports">
        <Input type="date" name="from" defaultValue={period.from} className="w-auto flex-1" aria-label="С" />
        <Input type="date" name="to" defaultValue={period.to} className="w-auto flex-1" aria-label="По" />
        <Button variant="secondary" type="submit">Показать</Button>
      </form>

      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard tone="dark" label="Чистая прибыль" value={money(s.net_profit)} hint="выручка − себестоимость − расходы" icon={<Banknote className="size-5" />} />
        <StatCard label="Выручка" value={money(s.revenue)} hint={`${num(s.sales_count)} продаж`} icon={<TrendingUp className="size-5" />} />
        <StatCard label="Валовая прибыль" value={money(s.gross_profit)} hint={`маржа ${num(margin.toFixed(1))}%`} tone="green" icon={<Percent className="size-5" />} />
        <StatCard label="Расходы" value={money(s.expenses)} tone="red" icon={<ReceiptText className="size-5" />} />
        <StatCard label="Себестоимость" value={money(s.cogs)} icon={<Coins className="size-5" />} />
        <StatCard label="Средний чек" value={money(s.avg_check)} icon={<ShoppingBag className="size-5" />} />
        <StatCard label="Скидки" value={money(s.discounts)} tone="amber" />
        <StatCard label="Продано в долг" value={money(s.new_debt)} tone="amber" />
      </div>

      {d.length > 1 && (
        <Card className="mt-4">
          <CardHeader title="Выручка и прибыль по дням" />
          <div className="px-2 pb-3">
            <TrendChart data={d} showProfit height={260} />
          </div>
        </Card>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Топ товаров по выручке" />
          {t.length === 0 ? (
            <EmptyState title="Продаж за период нет" />
          ) : (
            <>
              <div className="px-2">
                <HBarChart data={t.map((x) => ({ label: x.name, value: Number(x.revenue) }))} color={SERIES.revenue} />
              </div>
              <table className="mt-2 w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr className="border-t border-line">
                    <th className="px-4 py-2 font-medium">Товар</th>
                    <th className="px-2 py-2 text-right font-medium">Кол-во</th>
                    <th className="px-4 py-2 text-right font-medium">Прибыль</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {t.map((x) => (
                    <tr key={x.product_id}>
                      <td className="px-4 py-2 break-words">{x.name}</td>
                      <td className="tabular px-2 py-2 text-right">{qty(x.qty)}</td>
                      <td className={`tabular px-4 py-2 text-right font-semibold ${Number(x.profit) < 0 ? "text-red-600" : ""}`}>{money(x.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Card>
        <Card>
          <CardHeader title="Расходы по категориям" />
          {expChart.length === 0 ? (
            <EmptyState title="Расходов за период нет" />
          ) : (
            <div className="px-2 pb-3">
              <HBarChart data={expChart} color={SERIES.revenue} />
            </div>
          )}
        </Card>
      </div>

      {d.length > 0 && (
        <Card className="mt-4 overflow-hidden">
          <CardHeader title="Таблица по дням" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">День</th>
                  <th className="px-2 py-2 text-right font-medium">Продаж</th>
                  <th className="px-2 py-2 text-right font-medium">Выручка</th>
                  <th className="px-2 py-2 text-right font-medium">Вал. прибыль</th>
                  <th className="px-4 py-2 text-right font-medium">Расходы</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[...d].reverse().filter((x) => x.sales_count > 0 || x.expenses > 0).map((x) => (
                  <tr key={x.day}>
                    <td className="px-4 py-2">{shortDay(x.day)}</td>
                    <td className="tabular px-2 py-2 text-right">{x.sales_count}</td>
                    <td className="tabular px-2 py-2 text-right">{num(x.revenue)}</td>
                    <td className="tabular px-2 py-2 text-right">{num(x.profit)}</td>
                    <td className="tabular px-4 py-2 text-right">{num(x.expenses)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
