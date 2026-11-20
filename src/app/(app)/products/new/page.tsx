import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Category } from "@/lib/types";
import { PageHeader } from "@/components/ui";
import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "Новый товар" };

export default async function NewProductPage() {
  await requirePermission("products.edit");
  const supabase = await createClient();
  const { data } = await supabase.from("categories").select("*").order("name");
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Новый товар" back="/products" />
      <ProductForm categories={(data ?? []) as Category[]} />
    </div>
  );
}
