import type { Metadata } from "next";
import { ReceiptText } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { dateOnly, isoDay, money, presetPeriod } from "@/lib/format";
import type { Currency } from "@/lib/types";
import { Card, CardHeader, Chips, EmptyState, PageHeader } from "@/components/ui";
import { HBarChart } from "@/components/charts";
import { DeleteExpenseButton, ExpenseForm } from "./expense-forms";

import { ExportButton } from "@/components/export-button";

export const metadata: Metadata = { title: "Расходы" };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const profile = await requirePermission("expenses.view");
  const { p = "month" } = await searchParams;
  const period = presetPeriod(p);
  const supabase = await createClient();
  const { data } = await supabase
    .from("expenses")
    .select("id, category, amount, currency, rate, expense_date, paid_from_cash, note, profiles:created_by(full_name)")
    .gte("expense_date", period.from)
    .lte("expense_date", period.to)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(300);
  const list = (data ?? []) as unknown as {
    id: string;
    category: string;
    amount: number;
    currency: Currency;
    rate: number;
    expense_date: string;
    paid_from_cash: boolean;
    note: string | null;
    profiles: { full_name: string } | null;
  }[];
  const totalTjs = list.reduce((s, e) => s + Number(e.amount) * Number(e.rate), 0);
  const byCat = new Map<string, number>();
  list.forEach((e) => byCat.set(e.category, (byCat.get(e.category) ?? 0) + Number(e.amount) * Number(e.rate)));
  const chart = [...byCat.entries()].map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 })).sort((a, b) => b.value - a.value);
  const canDelete = can(profile.role, "expenses.delete");

  return (
    <div>
      <PageHeader title="Расходы" subtitle={`${period.label}: ${money(totalTjs)}`} action={<ExportButton href={`/api/export/expenses?p=${p}`} />} />
      <Chips
        active={p}
        items={[
          { key: "today", label: "Сегодня", href: "/expenses?p=today" },
          { key: "7d", label: "7 дней", href: "/expenses?p=7d" },
          { key: "month", label: "Месяц", href: "/expenses?p=month" },
          { key: "30d", label: "30 дней", href: "/expenses?p=30d" },
          { key: "all", label: "Всё время", href: "/expenses?p=all" },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <ExpenseForm today={isoDay()} categories={[...byCat.keys()]} />
        </div>
        <div className="space-y-4">
          {chart.length > 0 && (
            <Card>
              <CardHeader title="По категориям" subtitle="в пересчёте на TJS" />
              <div className="px-2 pb-3">
                <HBarChart data={chart} color="#2557eb" />
              </div>
            </Card>
          )}
          <Card className="overflow-hidden">
            <CardHeader title="Список расходов" />
            {list.length === 0 ? (
              <EmptyState icon={<ReceiptText className="size-6" />} title="Расходов за период нет" />
            ) : (
              <div className="divide-y divide-line">
                {list.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium">{e.category}</p>
                      <p className="truncate text-[13px] text-muted">
                        {dateOnly(e.expense_date)}
                        {e.paid_from_cash ? " · из кассы" : ""}
                        {e.note ? ` · ${e.note}` : ""}
                        {e.profiles?.full_name ? ` · ${e.profiles.full_name}` : ""}
                      </p>
                    </div>
                    <p className="tabular font-semibold text-red-600">− {money(e.amount, e.currency)}</p>
                    {canDelete && <DeleteExpenseButton id={e.id} />}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
