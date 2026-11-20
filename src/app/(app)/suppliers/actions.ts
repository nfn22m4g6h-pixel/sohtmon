"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorize } from "@/lib/auth";
import { dbError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

export async function saveSupplier(_: ActionState, fd: FormData): Promise<ActionState> {
  const auth = await authorize("suppliers.view");
  if ("error" in auth) return auth;
  const id = String(fd.get("id") ?? "");
  const payload = {
    name: String(fd.get("name") ?? "").trim(),
    phone: String(fd.get("phone") ?? "").trim() || null,
    country: String(fd.get("country") ?? "").trim() || null,
    note: String(fd.get("note") ?? "").trim() || null,
  };
  if (!payload.name) return { error: "Введите название поставщика" };
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("suppliers").update(payload).eq("id", id);
    if (error) return { error: dbError(error) };
    revalidatePath(`/suppliers/${id}`);
    return { ok: true, message: "Сохранено" };
  }
  const { data, error } = await supabase.from("suppliers").insert(payload).select("id").single();
  if (error) return { error: dbError(error) };
  revalidatePath("/suppliers");
  if (fd.get("stay") === "1") return { ok: true, id: data.id, message: "Поставщик добавлен" };
  redirect(`/suppliers/${data.id}`);
}

export async function addSupplierPayment(_: ActionState, fd: FormData): Promise<ActionState> {
  const auth = await authorize("suppliers.pay");
  if ("error" in auth) return auth;
  const amount = Number(String(fd.get("amount") ?? "").replace(",", "."));
  if (!(amount > 0)) return { error: "Введите сумму больше нуля" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_supplier_payment", {
    p_supplier_id: String(fd.get("supplier_id")),
    p_amount: amount,
    p_currency: fd.get("currency") === "TJS" ? "TJS" : "CNY",
    p_method: String(fd.get("method") ?? "cash"),
    p_note: String(fd.get("note") ?? "") || null,
  });
  if (error) return { error: dbError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Оплата поставщику проведена" };
}

export async function deleteSupplier(fd: FormData) {
  const id = String(fd.get("id"));
  const auth = await authorize("products.delete");
  if ("error" in auth) redirect(`/suppliers/${id}?error=${encodeURIComponent(auth.error)}`);
  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").delete().eq("id", id);
  if (error) redirect(`/suppliers/${id}?error=${encodeURIComponent(dbError(error))}`);
  revalidatePath("/suppliers");
  redirect("/suppliers");
}
