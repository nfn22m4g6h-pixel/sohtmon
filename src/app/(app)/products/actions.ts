"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorize } from "@/lib/auth";
import { dbError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

function numberField(fd: FormData, key: string) {
  const raw = String(fd.get(key) ?? "").replace(",", ".").replace(/\s/g, "");
  const n = raw === "" ? 0 : Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

function productPayload(fd: FormData) {
  return {
    name: String(fd.get("name") ?? "").trim(),
    sku: String(fd.get("sku") ?? "").trim() || null,
    barcode: String(fd.get("barcode") ?? "").trim() || null,
    category_id: String(fd.get("category_id") ?? "") || null,
    unit: String(fd.get("unit") ?? "шт").trim() || "шт",
    purchase_price: numberField(fd, "purchase_price"),
    purchase_currency: fd.get("purchase_currency") === "TJS" ? "TJS" : "CNY",
    sale_price: numberField(fd, "sale_price"),
    sale_currency: fd.get("sale_currency") === "CNY" ? "CNY" : "TJS",
    min_stock: numberField(fd, "min_stock"),
    is_active: fd.get("is_active") !== "off",
  };
}

export async function saveProduct(_: ActionState, fd: FormData): Promise<ActionState> {
  const auth = await authorize("products.edit");
  if ("error" in auth) return auth;
  const id = String(fd.get("id") ?? "");
  const payload = productPayload(fd);
  if (!payload.name) return { error: "Введите название товара" };
  for (const k of ["purchase_price", "sale_price", "min_stock"] as const) {
    if (Number.isNaN(payload[k]) || payload[k] < 0) return { error: "Цены и минимальный остаток должны быть числами ≥ 0" };
  }

  const supabase = await createClient();
  let productId = id;
  if (id) {
    const { error } = await supabase.from("products").update(payload).eq("id", id);
    if (error) return { error: dbError(error) };
  } else {
    const { data, error } = await supabase.from("products").insert(payload).select("id").single();
    if (error) return { error: dbError(error) };
    productId = data.id;
    const initial = numberField(fd, "initial_stock");
    if (initial > 0) {
      const { error: adjError } = await supabase.rpc("create_adjustment", {
        p_product_id: productId,
        p_qty_delta: initial,
        p_reason: "initial",
        p_note: "Начальный остаток",
      });
      if (adjError) return { error: `Товар создан, но остаток не записан: ${dbError(adjError)}` };
    }
  }
  revalidatePath("/products");
  revalidatePath("/");
  redirect(`/products/${productId}`);
}

export async function deleteProduct(fd: FormData) {
  const auth = await authorize("products.delete");
  if ("error" in auth) redirect(`/products?error=${encodeURIComponent(auth.error)}`);
  const id = String(fd.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) redirect(`/products/${id}?error=${encodeURIComponent(dbError(error))}`);
  revalidatePath("/products");
  redirect("/products");
}
