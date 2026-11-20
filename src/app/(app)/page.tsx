import Link from "next/link";
import { AlertTriangle, Banknote, Factory, HandCoins, Package, ShoppingCart, TrendingUp, Truck, Wallet } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { addDays, dateTime, isoDay, money, periodRange, presetPeriod, qty } from "@/lib/format";
import type { Currency, Product, Sale } from "@/lib/types";
import { Badge, Card, CardHeader, EmptyState, LinkButton, List, ListRow, StatCard } from "@/components/ui";
import { TrendChart } from "@/components/charts";

export default async function DashboardPage() {
  const profile = await requirePermission("dashboard.view");
  const role = profile.role;
  const supabase = await createClient();
  const today = isoDay();
  const todayRange = periodRange(today, today);
  const month = presetPeriod("month");
  const monthRange = periodRange(month.from, month.to);
  const from14 = addDays(today, -13);
  const range14 = periodRange(from14, today);

  const showSales = can(role, "sales.view");
  const showReports = can(role, "reports.view");
  const showCash = can(role, "cash.view");
  const showDebts = can(role, "customers.view");
  const showStock = can(role, "products.view");
  const showSuppliers = can(role, "suppliers.pay");

  const [todaySales, daily, recent, summary, cash, debts, lowStock, productCount, supplierDebts] = await Promise.all([
    showSales
      ? supabase.from("sales").select("total, rate").eq("status", "completed").gte("created_at", todayRange.start).lt("created_at", todayRange.end)
      : null,
    showReports
      ? supabase.rpc("report_daily", { p_from: range14.start, p_to: range14.end })
      : showSales
        ? supabase.rpc("sales_daily", { p_from: range14.start, p_to: range14.end })
        : null,
    showSales
      ? supabase
          .from("sales")
          .select("id, number, total, currency, status, created_at, debt, customers(name)")
          .order("created_at", { ascending: false })
          .limit(6)
      : null,
    showReports ? supabase.rpc("report_summary", { p_from: monthRange.start, p_to: monthRange.end }) : null,
    showCash ? supabase.from("cash_balances").select("currency, balance") : null,
    showDebts ? supabase.from("customer_balances").select("currency, balance").gt("balance", 0) : null,
    showStock ? supabase.from("low_stock_products").select("id, name, stock, min_stock, unit").order("stock").limit(6) : null,
    showStock ? supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", true) : null,
    showSuppliers ? supabase.from("supplier_balances").select("currency, balance").gt("balance", 0) : null,
  ]);
  const supplierBy = (cur: Currency) => (supplierDebts?.data ?? []).filter((d) => d.currency === cur).reduce((s, d) => s + Number(d.balance), 0);

  const todayRevenue = (todaySales?.data ?? []).reduce((s, r) => s + Number(r.total) * Number(r.rate), 0);
  const todayCount = todaySales?.data?.length ?? 0;
  const chart = ((daily?.data ?? []) as { day: string; revenue: number; profit?: number }[]).map((d) => ({
    day: d.day,
    revenue: Number(d.revenue),
    profit: d.profit !== undefined ? Number(d.profit) : undefined,
  }));
  const sum = summary?.data as Record<string, number> | null;
  const cashBy = (cur: Currency) => Number((cash?.data ?? []).find((c) => c.currency === cur)?.balance ?? 0);
  const debtBy = (cur: Currency) => (debts?.data ?? []).filter((d) => d.currency === cur).reduce((s, d) => s + Number(d.balance), 0);
  const low = (lowStock?.data ?? []) as Pick<Product, "id" | "name" | "stock" | "min_stock" | "unit">[];
  const recentSales = (recent?.data ?? []) as unknown as Sale[];

  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dushanbe", hour: "numeric" }).format(new Date()));
  const greet = hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер";

  return (
    <div>
      <div className="mb-5 flex items-end justify-between gap-3 animate-fade-up">
        <div>
          <p className="text-sm text-muted">{greet},</p>
          <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">{profile.full_name || "коллега"}</h1>
        </div>
        <div className="hidden gap-2 sm:flex">
          {can(role, "stock.edit") && (
            <LinkButton href="/arrivals/new" variant="outline">
              <Truck className="size-4" /> Приход
            </LinkButton>
          )}
          {can(role, "sales.create") && (
            <LinkButton href="/sales/new">
              <ShoppingCart className="size-4" /> Новая продажа
            </LinkButton>
          )}
        </div>
      </div>

      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        {showSales && (
          <StatCard tone="dark" label="Выручка сегодня" value={money(todayRevenue)} hint={`${todayCount} продаж`} icon={<TrendingUp className="size-5" />} href="/sales" />
        )}
        {showReports && sum && (
          <StatCard
            label="Прибыль за месяц"
            value={money(sum.net_profit)}
            hint={`Выручка ${money(sum.revenue)}`}
            tone={Number(sum.net_profit) >= 0 ? "green" : "red"}
            icon={<Banknote className="size-5" />}
            href="/reports?p=month"
          />
        )}
        {showCash && (
          <StatCard label="Касса" value={money(cashBy("TJS"))} hint={money(cashBy("CNY"), "CNY")} icon={<Wallet className="size-5" />} href="/cash" />
        )}
        {showDebts && (
          <StatCard
            label="Долги клиентов"
            value={money(debtBy("TJS"))}
            hint={money(debtBy("CNY"), "CNY")}
            tone="amber"
            icon={<HandCoins className="size-5" />}
            href="/debts"
          />
        )}
        {showSuppliers && (
          <StatCard
            label="Долг поставщикам"
            value={money(supplierBy("CNY"), "CNY")}
            hint={money(supplierBy("TJS"))}
            tone="red"
            icon={<Factory className="size-5" />}
            href="/suppliers"
          />
        )}
        {showStock && (
          <StatCard label="Товаров" value={productCount?.count ?? 0} hint="активных позиций" icon={<Package className="size-5" />} href="/products" />
        )}
        {showStock && (
          <StatCard
            label="Мало на складе"
            value={low.length >= 6 ? "6+" : low.length}
            hint="ниже минимума"
            tone={low.length ? "red" : "green"}
            icon={<AlertTriangle className="size-5" />}
            href="/products?filter=low"
          />
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {chart.length > 0 && (
          <Card className="lg:col-span-2 animate-fade-up">
            <CardHeader title="Продажи за 14 дней" subtitle="в пересчёте на TJS" />
            <div className="px-2 pb-3">
              <TrendChart data={chart} showProfit={showReports} />
            </div>
          </Card>
        )}

        {showStock && (
          <Card className="animate-fade-up">
            <CardHeader title="Заканчиваются" action={<Link href="/products?filter=low" className="text-sm font-medium text-brand-600">Все</Link>} />
            {low.length === 0 ? (
              <EmptyState icon={<Package className="size-6" />} title="Всё в наличии" text="Нет товаров ниже минимального остатка" />
            ) : (
              <List>
                {low.map((p) => (
                  <ListRow
                    key={p.id}
                    href={`/products/${p.id}`}
                    title={p.name}
                    subtitle={`Минимум: ${qty(p.min_stock)} ${p.unit}`}
                    right={<Badge tone={Number(p.stock) <= 0 ? "red" : "amber"}>{qty(p.stock)} {p.unit}</Badge>}
                  />
                ))}
              </List>
            )}
          </Card>
        )}

        {showSales && (
          <Card className="animate-fade-up lg:col-span-2">
            <CardHeader title="Последние продажи" action={<Link href="/sales" className="text-sm font-medium text-brand-600">История</Link>} />
            {recentSales.length === 0 ? (
              <EmptyState icon={<ShoppingCart className="size-6" />} title="Продаж пока нет" />
            ) : (
              <List>
                {recentSales.map((s) => (
                  <ListRow
                    key={s.id}
                    href={`/sales/${s.id}`}
                    title={`Чек №${s.number}${s.customers?.name ? ` · ${s.customers.name}` : ""}`}
                    subtitle={dateTime(s.created_at)}
                    right={<span className={s.status === "cancelled" ? "text-slate-400 line-through" : ""}>{money(s.total, s.currency)}</span>}
                    rightSub={s.status === "cancelled" ? "Отменена" : Number(s.debt) > 0 ? <span className="text-amber-600">долг {money(s.debt, s.currency)}</span> : undefined}
                  />
                ))}
              </List>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
