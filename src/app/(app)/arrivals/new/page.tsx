import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Currency } from "@/lib/types";
import { LinkButton, Notice, PageHeader } from "@/components/ui";
import { isMissingSchema, UPGRADE_HINT } from "@/lib/errors";
import { ArrivalForm } from "./arrival-form";

export const metadata: Metadata = { title: "Новый приход" };

export default async function NewArrivalPage({ searchParams }: { searchParams: Promise<{ product?: string; supplier?: string }> }) {
  await requirePermission("stock.edit");
  const { product, supplier } = await searchParams;
  const supabase = await createClient();
  const [{ data }, { data: suppliers, error: supError }, { data: settings }] = await Promise.all([
    supabase.from("products").select("id, name, sku, unit, purchase_price, purchase_currency").eq("is_active", true).order("name").limit(2000),
    supabase.from("suppliers").select("id, name").order("name").limit(1000),
    supabase.from("settings").select("cny_rate").maybeSingle(),
  ]);
  const products = (data ?? []) as { id: string; name: string; sku: string | null; unit: string; purchase_price: number; purchase_currency: Currency }[];
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Новый приход" subtitle="Остатки и полная себестоимость пересчитаются автоматически" back="/arrivals" />
      {isMissingSchema(supError) && <div className="mb-4"><Notice tone="amber">Поставщики, долг поставщику и доп. расходы: {UPGRADE_HINT}</Notice></div>}
      {products.length === 0 ? (
        <Notice tone="amber">
          Сначала добавьте товары. <LinkButton href="/products/new" variant="ghost" size="sm">Добавить товар</LinkButton>
        </Notice>
      ) : (
        <ArrivalForm
          products={products}
          suppliers={suppliers ?? []}
          cnyRate={Number(settings?.cny_rate ?? 1)}
          initialProduct={product}
          initialSupplier={supplier}
        />
      )}
    </div>
  );
}
