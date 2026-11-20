import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { dateTime, money, qty } from "@/lib/format";
import type { Currency } from "@/lib/types";
import { Badge, Card, CardHeader, List, ListRow, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Приход" };

export default async function ArrivalPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requirePermission("stock.view");
  const { id } = await params;
  const supabase = await createClient();
  const canPay = can(profile.role, "suppliers.pay");
  const showCost = can(profile.role, "products.cost");
  const [{ data }, { data: costs }, { data: payments }] = await Promise.all([
    supabase
      .from("stock_arrivals")
      .select("*, profiles:created_by(full_name), stock_arrival_items(id, qty, cost, total, landed_unit_cost_tjs, products(name, unit))")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("stock_arrival_costs").select("id, name, amount, currency, paid_from_cash").eq("arrival_id", id),
    canPay ? supabase.from("supplier_payments").select("amount").eq("arrival_id", id) : Promise.resolve({ data: [] }),
  ]);
  if (!data) notFound();
  const a = data as unknown as {
    number: number;
    supplier: string | null;
    supplier_id: string | null;
    currency: Currency;
    rate: number;
    total: number;
    paid_from_cash: boolean;
    extra_costs_tjs: number;
    note: string | null;
    created_at: string;
    profiles: { full_name: string } | null;
    stock_arrival_items: { id: string; qty: number; cost: number; total: number; landed_unit_cost_tjs: number | null; products: { name: string; unit: string } | null }[];
  };
  const paidNow = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={`Приход №${a.number}`} subtitle={dateTime(a.created_at)} back="/arrivals" />
      <Card className="mb-4 grid grid-cols-2 gap-4 p-4 text-sm">
        <div>
          <p className="text-muted">Поставщик</p>
          {a.supplier_id ? (
            <Link href={`/suppliers/${a.supplier_id}`} className="font-semibold text-brand-600">{a.supplier}</Link>
          ) : (
            <p className="font-semibold">{a.supplier ?? "—"}</p>
          )}
        </div>
        <div><p className="text-muted">Принял</p><p className="font-semibold">{a.profiles?.full_name ?? "—"}</p></div>
        <div><p className="text-muted">Сумма товаров</p><p className="tabular text-lg font-bold">{money(a.total, a.currency)}</p></div>
        <div>
          <p className="text-muted">Оплата</p>
          {a.supplier_id && canPay ? (
            paidNow >= Number(a.total) ? <Badge tone="green">Оплачено</Badge> : <Badge tone="red">При приходе: {money(paidNow, a.currency)}</Badge>
          ) : a.paid_from_cash ? (
            <Badge tone="blue">Из кассы</Badge>
          ) : (
            <Badge>Не из кассы</Badge>
          )}
          {a.currency === "CNY" && <p className="mt-1 text-xs text-muted">Курс {Number(a.rate)} TJS</p>}
        </div>
        {Number(a.extra_costs_tjs) > 0 && (
          <div className="col-span-2"><p className="text-muted">Доп. расходы (в себестоимости)</p><p className="tabular font-semibold">{money(a.extra_costs_tjs)}</p></div>
        )}
        {a.note && <div className="col-span-2"><p className="text-muted">Комментарий</p><p>{a.note}</p></div>}
      </Card>
      <Card className="mb-4 overflow-hidden">
        <CardHeader title="Товары" />
        <List>
          {a.stock_arrival_items.map((i) => (
            <ListRow
              key={i.id}
              title={i.products?.name ?? "—"}
              subtitle={`${qty(i.qty)} ${i.products?.unit ?? ""} × ${money(i.cost, a.currency)}${showCost && i.landed_unit_cost_tjs ? ` · себест. ${money(Number(i.landed_unit_cost_tjs).toFixed(2))}/ед.` : ""}`}
              right={money(i.total, a.currency)}
            />
          ))}
        </List>
      </Card>
      {(costs ?? []).length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader title="Доставка и другие расходы" />
          <List>
            {(costs ?? []).map((c) => (
              <ListRow key={c.id} title={c.name} subtitle={c.paid_from_cash ? "из кассы" : "не из кассы"} right={money(c.amount, c.currency as Currency)} />
            ))}
          </List>
        </Card>
      )}
    </div>
  );
}
