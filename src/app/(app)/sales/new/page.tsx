import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { Pos, type PosProduct } from "./pos";

export const metadata: Metadata = { title: "Новая продажа" };

export default async function NewSalePage() {
  const profile = await requirePermission("sales.create");
  const supabase = await createClient();
  const [{ data: products }, { data: customers }, { data: settings }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, sku, barcode, stock, unit, sale_price, sale_currency")
      .eq("is_active", true)
      .order("name")
      .limit(2000),
    supabase.from("customers").select("id, name, phone").order("name").limit(2000),
    supabase.from("settings").select("cny_rate").maybeSingle(),
  ]);
  return (
    <div>
      <PageHeader title="Новая продажа" />
      <Pos
        products={(products ?? []) as PosProduct[]}
        customers={customers ?? []}
        cnyRate={Number(settings?.cny_rate ?? 1)}
        canPrice={can(profile.role, "sales.price")}
      />
    </div>
  );
}
