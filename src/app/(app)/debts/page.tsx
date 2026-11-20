import type { Metadata } from "next";
import { HandCoins } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateTime, money } from "@/lib/format";
import type { Currency, CustomerBalance } from "@/lib/types";
import { Card, CardHeader, EmptyState, List, ListRow, PageHeader, StatCard } from "@/components/ui";

export const metadata: Metadata = { title: "Долги и оплаты" };

export default async function DebtsPage() {
  await requirePermission("customers.view");
  const supabase = await createClient();
  const [{ data: balances }, { data: customers }, { data: payments }] = await Promise.all([
    supabase.from("customer_balances").select("*").gt("balance", 0).order("balance", { ascending: false }),
    supabase.from("customers").select("id, name, phone"),
    supabase.from("customer_payments").select("id, amount, currency, created_at, customers(name)").order("created_at", { ascending: false }).limit(15),
  ]);
  const names = new Map((customers ?? []).map((c) => [c.id, c]));
  const list = (balances ?? []) as CustomerBalance[];
  const total = (cur: Currency) => list.filter((b) => b.currency === cur).reduce((s, b) => s + Number(b.balance), 0);
  const recent = (payments ?? []) as unknown as { id: string; amount: number; currency: Currency; created_at: string; customers: { name: string } | null }[];

  return (
    <div>
      <PageHeader title="Долги и оплаты" subtitle={`${new Set(list.map((b) => b.customer_id)).size} должников`} />
      <div className="stagger mb-4 grid grid-cols-2 gap-3">
        <StatCard label="Долги в TJS" value={money(total("TJS"))} tone="amber" icon={<HandCoins className="size-5" />} />
        <StatCard label="Долги в CNY" value={money(total("CNY"), "CNY")} tone="amber" icon={<HandCoins className="size-5" />} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader title="Должники" subtitle="Нажмите, чтобы принять оплату" />
          {list.length === 0 ? (
            <EmptyState icon={<HandCoins className="size-6" />} title="Долгов нет" text="Все клиенты рассчитались" />
          ) : (
            <List>
              {list.map((b) => (
                <ListRow
                  key={`${b.customer_id}-${b.currency}`}
                  href={`/customers/${b.customer_id}`}
                  title={names.get(b.customer_id)?.name ?? "—"}
                  subtitle={names.get(b.customer_id)?.phone ?? `Всего в долг: ${money(b.total_debt, b.currency)}`}
                  right={<span className="text-amber-600">{money(b.balance, b.currency)}</span>}
                  rightSub={`оплачено ${money(b.total_paid, b.currency)}`}
                />
              ))}
            </List>
          )}
        </Card>
        <Card className="overflow-hidden">
          <CardHeader title="Последние оплаты" />
          {recent.length === 0 ? (
            <EmptyState title="Оплат пока нет" />
          ) : (
            <List>
              {recent.map((p) => (
                <ListRow key={p.id} title={p.customers?.name ?? "—"} subtitle={dateTime(p.created_at)} right={<span className="text-emerald-600">+ {money(p.amount, p.currency)}</span>} />
              ))}
            </List>
          )}
        </Card>
      </div>
    </div>
  );
}
