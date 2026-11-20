import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Truck } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { dateTime, money, PAYMENT_LABEL } from "@/lib/format";
import type { Currency, PaymentMethod } from "@/lib/types";
import { Button, Card, CardHeader, EmptyState, LinkButton, List, ListRow, Notice, PageHeader } from "@/components/ui";
import { EditSupplierButton, SupplierPaymentForm } from "../supplier-forms";
import { deleteSupplier } from "../actions";

export const metadata: Metadata = { title: "Поставщик" };

type Item = { id: string; kind: "arrival" | "payment"; date: string; title: string; amount: number; currency: Currency; sub: string; href?: string };

export default async function SupplierPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const profile = await requirePermission("suppliers.view");
  const { id } = await params;
  const { error } = await searchParams;
  const canPay = can(profile.role, "suppliers.pay");
  const supabase = await createClient();
  const [{ data: supplier }, { data: balances }, { data: arrivals }, { data: payments }] = await Promise.all([
    supabase.from("suppliers").select("*").eq("id", id).maybeSingle(),
    canPay ? supabase.from("supplier_balances").select("*").eq("supplier_id", id) : Promise.resolve({ data: [] }),
    supabase.from("stock_arrivals").select("id, number, total, currency, created_at, extra_costs_tjs").eq("supplier_id", id).order("created_at", { ascending: false }).limit(100),
    canPay
      ? supabase.from("supplier_payments").select("id, amount, currency, method, note, created_at").eq("supplier_id", id).order("created_at", { ascending: false }).limit(100)
      : Promise.resolve({ data: [] }),
  ]);
  if (!supplier) notFound();
  const bal = (balances ?? []) as { currency: Currency; balance: number; total_purchased: number }[];
  const balanceOf = (c: Currency) => Number(bal.find((b) => b.currency === c)?.balance ?? 0);

  const history: Item[] = [
    ...(arrivals ?? []).map((a) => ({
      id: `a${a.id}`,
      kind: "arrival" as const,
      date: a.created_at,
      title: `Приход №${a.number}`,
      amount: Number(a.total),
      currency: a.currency as Currency,
      sub: Number(a.extra_costs_tjs) > 0 ? `+ доп. расходы ${money(a.extra_costs_tjs)}` : "закупка",
      href: `/arrivals/${a.id}`,
    })),
    ...((payments ?? []) as { id: string; amount: number; currency: Currency; method: PaymentMethod; note: string | null; created_at: string }[]).map((p) => ({
      id: `p${p.id}`,
      kind: "payment" as const,
      date: p.created_at,
      title: `Оплата${p.note ? ` · ${p.note}` : ""}`,
      amount: Number(p.amount),
      currency: p.currency,
      sub: PAYMENT_LABEL[p.method],
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div>
      <PageHeader
        title={supplier.name}
        subtitle={[supplier.country, supplier.phone].filter(Boolean).join(" · ") || undefined}
        back="/suppliers"
        action={<EditSupplierButton supplier={supplier} />}
      />
      {error && <div className="mb-4"><Notice tone="red">{error}</Notice></div>}
      {canPay && (
        <div className="stagger mb-4 grid grid-cols-2 gap-3">
          {(["CNY", "TJS"] as Currency[]).map((c) => {
            const b = balanceOf(c);
            return (
              <Card key={c} className={b > 0 ? "border-red-200 bg-red-50/40 p-4" : "p-4"}>
                <p className="text-[13px] text-muted">{b < 0 ? "Аванс поставщику" : "Наш долг"} · {c}</p>
                <p className={`tabular mt-1 text-2xl font-bold ${b > 0 ? "text-red-600" : ""}`}>{money(Math.abs(b), c)}</p>
              </Card>
            );
          })}
        </div>
      )}
      {can(profile.role, "stock.edit") && (
        <LinkButton href={`/arrivals/new?supplier=${supplier.id}`} variant="secondary" className="mb-4 w-full sm:w-auto">
          <Truck className="size-4" /> Новый приход от поставщика
        </LinkButton>
      )}
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        {canPay && (
          <Card className="h-fit">
            <CardHeader title="Оплатить поставщику" />
            <SupplierPaymentForm supplierId={supplier.id} defaultCurrency={balanceOf("TJS") > 0 && balanceOf("CNY") <= 0 ? "TJS" : "CNY"} />
          </Card>
        )}
        <Card className="overflow-hidden">
          <CardHeader title="Приходы и оплаты" />
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
                  right={<span className={h.kind === "payment" ? "text-emerald-600" : ""}>{h.kind === "payment" ? "− " : ""}{money(h.amount, h.currency)}</span>}
                />
              ))}
            </List>
          )}
        </Card>
      </div>
      {supplier.note && <p className="mt-4 text-sm text-muted">Заметка: {supplier.note}</p>}
      {can(profile.role, "products.delete") && history.length === 0 && (
        <form action={deleteSupplier} className="mt-6">
          <input type="hidden" name="id" value={supplier.id} />
          <Button variant="danger" size="sm">Удалить поставщика</Button>
        </form>
      )}
    </div>
  );
}
