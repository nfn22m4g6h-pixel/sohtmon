import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SlidersHorizontal, Truck } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { dateTime, money, qty } from "@/lib/format";
import type { Category, Product } from "@/lib/types";
import { Badge, Button, Card, CardHeader, EmptyState, LinkButton, List, ListRow, Notice, PageHeader } from "@/components/ui";
import { ProductForm } from "../product-form";
import { deleteProduct } from "../actions";

export const metadata: Metadata = { title: "Товар" };

const MOVEMENT_LABEL: Record<string, string> = {
  sale: "Продажа",
  sale_cancel: "Отмена продажи",
  arrival: "Приход",
  adjustment: "Корректировка",
};

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const profile = await requirePermission("products.view");
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: product } = await supabase.from("products").select("*, categories(name)").eq("id", id).maybeSingle();
  if (!product) notFound();
  const p = product as Product;

  const canEdit = can(profile.role, "products.edit");
  const canStock = can(profile.role, "stock.view");
  const showCost = can(profile.role, "products.cost");
  const [{ data: categories }, { data: movements }] = await Promise.all([
    canEdit ? supabase.from("categories").select("*").order("name") : Promise.resolve({ data: [] }),
    canStock
      ? supabase.from("stock_movements").select("id, type, qty_delta, stock_after, created_at").eq("product_id", id).order("created_at", { ascending: false }).limit(30)
      : Promise.resolve({ data: [] }),
  ]);

  const out = Number(p.stock) <= 0;
  const low = !out && Number(p.stock) <= Number(p.min_stock);

  return (
    <div>
      <PageHeader title={p.name} subtitle={[p.sku, p.categories?.name].filter(Boolean).join(" · ") || undefined} back="/products" />
      {error && <div className="mb-4"><Notice tone="red">{error}</Notice></div>}

      <div className="stagger mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-[13px] text-muted">Остаток</p>
          <p className="tabular mt-1 text-2xl font-bold">
            {qty(p.stock)} <span className="text-base font-medium text-muted">{p.unit}</span>
          </p>
          <Badge tone={out ? "red" : low ? "amber" : "green"} className="mt-1">
            {out ? "Нет в наличии" : low ? "Мало" : "В наличии"}
          </Badge>
        </Card>
        <Card className="p-4">
          <p className="text-[13px] text-muted">Цена продажи</p>
          <p className="tabular mt-1 text-2xl font-bold">{money(p.sale_price, p.sale_currency)}</p>
          {!p.is_active && <Badge className="mt-1">Скрыт</Badge>}
        </Card>
        {showCost && (
          <Card className="p-4">
            <p className="text-[13px] text-muted">Закупка</p>
            <p className="tabular mt-1 text-2xl font-bold">{money(p.purchase_price, p.purchase_currency)}</p>
          </Card>
        )}
        {showCost && (
          <Card className="p-4">
            <p className="text-[13px] text-muted">Себестоимость (средняя)</p>
            <p className="tabular mt-1 text-2xl font-bold">{money(Number(p.avg_cost_tjs).toFixed(2))}</p>
          </Card>
        )}
      </div>

      {can(profile.role, "stock.edit") && (
        <div className="mb-4 flex gap-2">
          <LinkButton href={`/arrivals/new?product=${p.id}`} variant="secondary" className="flex-1 sm:flex-none">
            <Truck className="size-4" /> Приход
          </LinkButton>
          <LinkButton href={`/adjustments?product=${p.id}`} variant="outline" className="flex-1 sm:flex-none">
            <SlidersHorizontal className="size-4" /> Корректировка
          </LinkButton>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {canEdit && (
          <div>
            <h2 className="mb-2 text-[15px] font-semibold">Редактирование</h2>
            <ProductForm product={p} categories={(categories ?? []) as Category[]} />
            {can(profile.role, "products.delete") && (
              <form action={deleteProduct} className="mt-3">
                <input type="hidden" name="id" value={p.id} />
                <Button variant="danger" className="w-full">
                  Удалить товар
                </Button>
                <p className="mt-1 text-center text-xs text-muted">Товар с историей продаж удалить нельзя — скройте его.</p>
              </form>
            )}
          </div>
        )}
        {canStock && (
          <Card className="h-fit">
            <CardHeader title="Движение товара" subtitle="Последние 30 операций" />
            {(movements ?? []).length === 0 ? (
              <EmptyState title="Движений пока нет" />
            ) : (
              <List>
                {(movements ?? []).map((m) => (
                  <ListRow
                    key={m.id}
                    title={MOVEMENT_LABEL[m.type] ?? m.type}
                    subtitle={dateTime(m.created_at)}
                    right={
                      <span className={Number(m.qty_delta) > 0 ? "text-emerald-600" : "text-red-600"}>
                        {Number(m.qty_delta) > 0 ? "+" : ""}
                        {qty(m.qty_delta)}
                      </span>
                    }
                    rightSub={`остаток ${qty(m.stock_after)}`}
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
