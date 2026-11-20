import type { Metadata } from "next";
import { ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { dateTime, money, periodRange, presetPeriod } from "@/lib/format";
import type { Currency } from "@/lib/types";
import { Card, CardHeader, Chips, EmptyState, List, ListRow, PageHeader } from "@/components/ui";
import { CashForm } from "./cash-form";

export const metadata: Metadata = { title: "Касса" };

const SOURCE_LABEL: Record<string, string> = {
  sale: "Продажа",
  sale_cancel: "Отмена продажи",
  debt_payment: "Оплата долга",
  expense: "Расход",
  arrival: "Оплата прихода",
  manual: "Ручная операция",
};

export default async function CashPage({ searchParams }: { searchParams: Promise<{ p?: string; cur?: string }> }) {
  const profile = await requirePermission("cash.view");
  const { p = "today", cur } = await searchParams;
  const period = presetPeriod(p);
  const range = periodRange(period.from, period.to);
  const supabase = await createClient();
  let query = supabase
    .from("cash_transactions")
    .select("id, direction, source, currency, amount, note, created_at, profiles:created_by(full_name)")
    .gte("created_at", range.start)
    .lt("created_at", range.end)
    .order("created_at", { ascending: false })
    .limit(300);
  if (cur === "TJS" || cur === "CNY") query = query.eq("currency", cur);
  const [{ data: balances }, { data: txs }] = await Promise.all([supabase.from("cash_balances").select("*"), query]);
  const list = (txs ?? []) as unknown as {
    id: number;
    direction: "in" | "out";
    source: string;
    currency: Currency;
    amount: number;
    note: string | null;
    created_at: string;
    profiles: { full_name: string } | null;
  }[];
  const bal = (c: Currency) => Number((balances ?? []).find((b) => b.currency === c)?.balance ?? 0);
  const flow = (c: Currency, d: "in" | "out") => list.filter((t) => t.currency === c && t.direction === d).reduce((s, t) => s + Number(t.amount), 0);
  const href = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    Object.entries({ p, cur, ...extra }).forEach(([k, v]) => v && params.set(k, v));
    return `/cash?${params}`;
  };

  return (
    <div>
      <PageHeader title="Касса" subtitle="Наличные деньги по валютам" />
      <div className="stagger mb-4 grid gap-3 sm:grid-cols-2">
        {(["TJS", "CNY"] as Currency[]).map((c) => (
          <Card key={c} className={c === "TJS" ? "border-0 bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white" : "p-5"}>
            <div className="flex items-center justify-between">
              <p className={c === "TJS" ? "text-sm text-brand-100" : "text-sm text-muted"}>Остаток в кассе · {c}</p>
              <Wallet className={c === "TJS" ? "size-5 text-brand-200" : "size-5 text-brand-500"} />
            </div>
            <p className="tabular mt-2 text-3xl font-bold tracking-tight">{money(bal(c), c)}</p>
            <div className={`mt-3 flex gap-4 text-sm ${c === "TJS" ? "text-brand-100" : "text-muted"}`}>
              <span className="flex items-center gap-1"><ArrowDownLeft className="size-4" /> {money(flow(c, "in"), c)}</span>
              <span className="flex items-center gap-1"><ArrowUpRight className="size-4" /> {money(flow(c, "out"), c)}</span>
              <span className="ml-auto opacity-80">{period.label.toLowerCase()}</span>
            </div>
          </Card>
        ))}
      </div>
      <Chips
        active={p}
        items={[
          { key: "today", label: "Сегодня", href: href({ p: "today" }) },
          { key: "7d", label: "7 дней", href: href({ p: "7d" }) },
          { key: "month", label: "Месяц", href: href({ p: "month" }) },
          { key: "all", label: "Всё время", href: href({ p: "all" }) },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        {can(profile.role, "cash.edit") && <div><CashForm /></div>}
        <Card className="overflow-hidden lg:col-start-2">
          <CardHeader
            title="Операции"
            action={
              <div className="flex gap-1 text-sm">
                {[undefined, "TJS", "CNY"].map((c) => (
                  <a key={c ?? "all"} href={href({ cur: c })} className={`rounded-lg px-2 py-1 ${cur === c ? "bg-brand-50 font-semibold text-brand-700" : "text-muted"}`}>
                    {c ?? "Все"}
                  </a>
                ))}
              </div>
            }
          />
          {list.length === 0 ? (
            <EmptyState icon={<Wallet className="size-6" />} title="Операций за период нет" />
          ) : (
            <List>
              {list.map((t) => (
                <ListRow
                  key={t.id}
                  leading={
                    <div className={`grid size-10 shrink-0 place-items-center rounded-full ${t.direction === "in" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>
                      {t.direction === "in" ? <ArrowDownLeft className="size-5" /> : <ArrowUpRight className="size-5" />}
                    </div>
                  }
                  title={t.note ?? SOURCE_LABEL[t.source]}
                  subtitle={`${SOURCE_LABEL[t.source]} · ${dateTime(t.created_at)}${t.profiles?.full_name ? ` · ${t.profiles.full_name}` : ""}`}
                  right={
                    <span className={t.direction === "in" ? "text-emerald-600" : "text-red-600"}>
                      {t.direction === "in" ? "+" : "−"} {money(t.amount, t.currency)}
                    </span>
                  }
                />
              ))}
            </List>
          )}
        </Card>
      </div>
    </div>
  );
}
