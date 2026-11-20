import type { Metadata } from "next";
import { Plus, Truck } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { dateTime, money } from "@/lib/format";
import type { Currency } from "@/lib/types";
import { Badge, Card, EmptyState, LinkButton, List, ListRow, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Приход товара" };

export default async function ArrivalsPage() {
  const profile = await requirePermission("stock.view");
  const supabase = await createClient();
  const { data } = await supabase
    .from("stock_arrivals")
    .select("id, number, supplier, currency, total, paid_from_cash, created_at, stock_arrival_items(count)")
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as unknown as {
    id: string;
    number: number;
    supplier: string | null;
    currency: Currency;
    total: number;
    paid_from_cash: boolean;
    created_at: string;
    stock_arrival_items: { count: number }[];
  }[];
  return (
    <div>
      <PageHeader
        title="Приход товара"
        subtitle="Поступления от поставщиков"
        action={
          can(profile.role, "stock.edit") && (
            <LinkButton href="/arrivals/new">
              <Plus className="size-4" /> <span className="hidden sm:inline">Приход</span>
            </LinkButton>
          )
        }
      />
      <Card className="overflow-hidden animate-fade-up">
        {rows.length === 0 ? (
          <EmptyState icon={<Truck className="size-6" />} title="Приходов пока нет" text="Оформите поступление товара от поставщика" />
        ) : (
          <List>
            {rows.map((a) => (
              <ListRow
                key={a.id}
                href={`/arrivals/${a.id}`}
                leading={<div className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-xs font-bold text-emerald-700">№{a.number}</div>}
                title={a.supplier ?? "Без поставщика"}
                subtitle={`${dateTime(a.created_at)} · ${a.stock_arrival_items?.[0]?.count ?? 0} поз.`}
                right={money(a.total, a.currency)}
                rightSub={a.paid_from_cash ? <Badge tone="blue">из кассы</Badge> : undefined}
              />
            ))}
          </List>
        )}
      </Card>
    </div>
  );
}
