import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Phone } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { dateTime, money, PAYMENT_LABEL } from "@/lib/format";
import type { Currency, Customer, CustomerBalance, PaymentMethod } from "@/lib/types";
import { Button, Card, CardHeader, EmptyState, List, ListRow, Notice, PageHeader } from "@/components/ui";
import { EditCustomer, PaymentForm } from "../customer-forms";
import { deleteCustomer } from "../actions";

export const metadata: Metadata = { title: "Клиент" };

type HistoryItem = { id: string; kind: "sale" | "payment"; date: string; title: string; amount: number; currency: Currency; sub: string; href?: string; cancelled?: boolean };

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const profile = await requirePermission("customers.view");
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const [{ data: customer }, { data: balances }, { data: sales }, { data: payments }] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).maybeSingle(),
    supabase.from("customer_balances").select("*").eq("customer_id", id),
    supabase.from("sales").select("id, number, total, debt, currency, status, created_at").eq("customer_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("customer_payments").select("id, amount, currency, method, note, created_at").eq("customer_id", id).order("created_at", { ascending: false }).limit(100),
  ]);
  if (!customer) notFound();
  const c = customer as Customer;
  const bal = (balances ?? []) as CustomerBalance[];
  const balanceOf = (cur: Currency) => Number(bal.find((b) => b.currency === cur)?.balance ?? 0);

  const history: HistoryItem[] = [
    ...(sales ?? []).map((s) => ({
      id: `s${s.id}`,
      kind: "sale" as const,
      date: s.created_at,
      title: `Покупка, чек №${s.number}`,
      amount: Number(s.total),
      currency: s.currency as Currency,
      sub: s.status === "cancelled" ? "Отменена" : Number(s.debt) > 0 ? `в долг ${money(s.debt, s.currency)}` : "оплачено",
      href: `/sales/${s.id}`,
      cancelled: s.status === "cancelled",
    })),
    ...(payments ?? []).map((p) => ({
      id: `p${p.id}`,
      kind: "payment" as const,
      date: p.created_at,
      title: `Оплата долга${p.note ? ` · ${p.note}` : ""}`,
      amount: Number(p.amount),
      currency: p.currency as Currency,
      sub: PAYMENT_LABEL[p.method as PaymentMethod],
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div>
      <PageHeader
        title={c.name}
        subtitle={c.address ?? undefined}
        back="/customers"
        action={can(profile.role, "customers.edit") && <EditCustomer customer={c} />}
      />
      {error && <div className="mb-4"><Notice tone="red">{error}</Notice></div>}
      {c.phone && (
        <a href={`tel:${c.phone}`} className="mb-4 inline-flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700">
          <Phone className="size-4" /> {c.phone}
        </a>
      )}
      <div className="stagger mb-4 grid grid-cols-2 gap-3">
        {(["TJS", "CNY"] as Currency[]).map((cur) => {
          const b = balanceOf(cur);
          return (
            <Card key={cur} className={b > 0 ? "border-amber-200 bg-amber-50/50 p-4" : "p-4"}>
              <p className="text-[13px] text-muted">{b < 0 ? "Аванс" : "Долг"} в {cur}</p>
              <p className={`tabular mt-1 text-2xl font-bold ${b > 0 ? "text-amber-700" : ""}`}>{money(Math.abs(b), cur)}</p>
            </Card>
          );
        })}
      </div>
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        {can(profile.role, "customers.edit") && (
          <Card className="h-fit">
            <CardHeader title="Принять оплату долга" />
            <PaymentForm customerId={c.id} defaultCurrency={balanceOf("CNY") > 0 && balanceOf("TJS") <= 0 ? "CNY" : "TJS"} />
          </Card>
        )}
        <Card className="overflow-hidden">
          <CardHeader title="История операций" />
          {history.length === 0 ? (
            <EmptyState title="Операций пока нет" />
          ) : (
            <List>
              {history.map((h) => (
                <ListRow
                  key={h.id}
                  href={h.href}
                  title={h.title}
                  subtitle={`${dateTime(h.date)} · ${h.sub}`}
                  right={
                    <span className={h.cancelled ? "text-slate-400 line-through" : h.kind === "payment" ? "text-emerald-600" : ""}>
                      {h.kind === "payment" ? "+ " : ""}
                      {money(h.amount, h.currency)}
                    </span>
                  }
                />
              ))}
            </List>
          )}
        </Card>
      </div>
      {c.note && <p className="mt-4 text-sm text-muted">Заметка: {c.note}</p>}
      {can(profile.role, "customers.delete") && history.length === 0 && (
        <form action={deleteCustomer} className="mt-6">
          <input type="hidden" name="id" value={c.id} />
          <Button variant="danger" size="sm">Удалить клиента</Button>
        </form>
      )}
    </div>
  );
}
