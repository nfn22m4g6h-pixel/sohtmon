import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateTime, money, qty } from "@/lib/format";
import type { Currency } from "@/lib/types";
import { Badge, Card, List, ListRow, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Приход" };

export default async function ArrivalPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("stock.view");
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("stock_arrivals")
    .select("*, profiles:created_by(full_name), stock_arrival_items(id, qty, cost, total, products(name, unit))")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const a = data as unknown as {
    number: number;
    supplier: string | null;
    currency: Currency;
    rate: number;
    total: number;
    paid_from_cash: boolean;
    note: string | null;
    created_at: string;
    profiles: { full_name: string } | null;
    stock_arrival_items: { id: string; qty: number; cost: number; total: number; products: { name: string; unit: string } | null }[];
  };
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={`Приход №${a.number}`} subtitle={dateTime(a.created_at)} back="/arrivals" />
      <Card className="mb-4 grid grid-cols-2 gap-4 p-4 text-sm">
        <div><p className="text-muted">Поставщик</p><p className="font-semibold">{a.supplier ?? "—"}</p></div>
        <div><p className="text-muted">Принял</p><p className="font-semibold">{a.profiles?.full_name ?? "—"}</p></div>
        <div><p className="text-muted">Сумма</p><p className="tabular text-lg font-bold">{money(a.total, a.currency)}</p></div>
        <div>
          <p className="text-muted">Оплата</p>
          {a.paid_from_cash ? <Badge tone="blue">Из кассы</Badge> : <Badge>Не из кассы</Badge>}
          {a.currency === "CNY" && <p className="mt-1 text-xs text-muted">Курс {Number(a.rate)} TJS</p>}
        </div>
        {a.note && <div className="col-span-2"><p className="text-muted">Комментарий</p><p>{a.note}</p></div>}
      </Card>
      <Card className="overflow-hidden">
        <List>
          {a.stock_arrival_items.map((i) => (
            <ListRow
              key={i.id}
              title={i.products?.name ?? "—"}
              subtitle={`${qty(i.qty)} ${i.products?.unit ?? ""} × ${money(i.cost, a.currency)}`}
              right={money(i.total, a.currency)}
            />
          ))}
        </List>
      </Card>
    </div>
  );
}
