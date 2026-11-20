import type { Metadata } from "next";
import { SlidersHorizontal } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { dateTime, qty } from "@/lib/format";
import { Card, CardHeader, EmptyState, List, ListRow, PageHeader } from "@/components/ui";
import { AdjustmentForm, REASON_LABEL } from "./adjustment-form";

export const metadata: Metadata = { title: "Корректировки" };

export default async function AdjustmentsPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const profile = await requirePermission("stock.view");
  const { product } = await searchParams;
  const supabase = await createClient();
  const canEdit = can(profile.role, "stock.edit");
  const [{ data: products }, { data: rows }] = await Promise.all([
    canEdit ? supabase.from("products").select("id, name, stock, unit").eq("is_active", true).order("name").limit(2000) : Promise.resolve({ data: [] }),
    supabase
      .from("stock_adjustments")
      .select("id, qty_delta, reason, note, created_at, products(name, unit), profiles:created_by(full_name)")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const list = (rows ?? []) as unknown as {
    id: string;
    qty_delta: number;
    reason: string;
    note: string | null;
    created_at: string;
    products: { name: string; unit: string } | null;
    profiles: { full_name: string } | null;
  }[];

  return (
    <div>
      <PageHeader title="Корректировки остатков" subtitle="Инвентаризация, брак, потери и возвраты" />
      <div className="grid gap-4 lg:grid-cols-[400px_1fr]">
        {canEdit && (
          <div>
            <AdjustmentForm products={(products ?? []) as { id: string; name: string; stock: number; unit: string }[]} initialProduct={product} />
          </div>
        )}
        <Card className="overflow-hidden">
          <CardHeader title="История" />
          {list.length === 0 ? (
            <EmptyState icon={<SlidersHorizontal className="size-6" />} title="Корректировок пока нет" />
          ) : (
            <List>
              {list.map((a) => (
                <ListRow
                  key={a.id}
                  title={a.products?.name ?? "—"}
                  subtitle={`${REASON_LABEL[a.reason] ?? a.reason} · ${dateTime(a.created_at)}${a.profiles?.full_name ? ` · ${a.profiles.full_name}` : ""}${a.note ? ` · ${a.note}` : ""}`}
                  right={
                    <span className={Number(a.qty_delta) > 0 ? "text-emerald-600" : "text-red-600"}>
                      {Number(a.qty_delta) > 0 ? "+" : ""}
                      {qty(a.qty_delta)} {a.products?.unit}
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
