"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorize } from "@/lib/auth";
import { dbError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

export async function saveCustomer(_: ActionState, fd: FormData): Promise<ActionState> {
  const auth = await authorize("customers.edit");
  if ("error" in auth) return auth;
  const id = String(fd.get("id") ?? "");
  const payload = {
    name: String(fd.get("name") ?? "").trim(),
    phone: String(fd.get("phone") ?? "").trim() || null,
    address: String(fd.get("address") ?? "").trim() || null,
    note: String(fd.get("note") ?? "").trim() || null,
  };
  if (!payload.name) return { error: "Введите имя клиента" };
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("customers").update(payload).eq("id", id);
    if (error) return { error: dbError(error) };
    revalidatePath(`/customers/${id}`);
    return { ok: true, message: "Сохранено" };
  }
  const { data, error } = await supabase.from("customers").insert(payload).select("id").single();
  if (error) return { error: dbError(error) };
  revalidatePath("/customers");
  redirect(`/customers/${data.id}`);
}

export async function addPayment(_: ActionState, fd: FormData): Promise<ActionState> {
  const auth = await authorize("customers.edit");
  if ("error" in auth) return auth;
  const customerId = String(fd.get("customer_id"));
  const amount = Number(String(fd.get("amount") ?? "").replace(",", "."));
  if (!(amount > 0)) return { error: "Введите сумму больше нуля" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_customer_payment", {
    p_customer_id: customerId,
    p_amount: amount,
    p_currency: fd.get("currency") === "CNY" ? "CNY" : "TJS",
    p_method: String(fd.get("method") ?? "cash"),
    p_note: String(fd.get("note") ?? "") || null,
  });
  if (error) return { error: dbError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Оплата принята" };
}

export async function deleteCustomer(fd: FormData) {
  const auth = await authorize("customers.delete");
  const id = String(fd.get("id"));
  if ("error" in auth) redirect(`/customers/${id}?error=${encodeURIComponent(auth.error)}`);
  const supabase = await createClient();
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) redirect(`/customers/${id}?error=${encodeURIComponent(dbError(error))}`);
  revalidatePath("/customers");
  redirect("/customers");
}
