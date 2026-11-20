"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorize } from "@/lib/auth";
import { dbError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import type { ActionState, Currency, PaymentMethod } from "@/lib/types";

export type SaleInput = {
  items: { product_id: string; qty: number; price?: number }[];
  currency: Currency;
  customer_id: string | null;
  discount: number;
  paid: number;
  payment_method: PaymentMethod;
  note: string;
};

export async function createSale(input: SaleInput): Promise<ActionState> {
  const auth = await authorize("sales.create");
  if ("error" in auth) return auth;
  if (!input.items?.length) return { error: "Добавьте товары в чек" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_sale", {
    p_items: input.items,
    p_currency: input.currency,
    p_customer_id: input.customer_id,
    p_discount: input.discount || 0,
    p_paid: input.paid,
    p_payment_method: input.payment_method,
    p_note: input.note || null,
  });
  if (error) return { error: dbError(error) };
  revalidatePath("/", "layout");
  return { ok: true, id: (data as { id: string }).id };
}

export async function cancelSale(_: ActionState, fd: FormData): Promise<ActionState> {
  const auth = await authorize("sales.cancel");
  if ("error" in auth) return auth;
  const id = String(fd.get("id"));
  const reason = String(fd.get("reason") ?? "").trim();
  if (!reason) return { error: "Укажите причину отмены" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_sale", { p_sale_id: id, p_reason: reason });
  if (error) return { error: dbError(error) };
  revalidatePath("/", "layout");
  redirect(`/sales/${id}`);
}

export async function returnItems(input: {
  sale_id: string;
  items: { sale_item_id: string; qty: number }[];
  refund_method: PaymentMethod;
  reason: string;
}): Promise<ActionState> {
  const auth = await authorize("sales.return");
  if ("error" in auth) return auth;
  const items = input.items.filter((i) => i.qty > 0);
  if (!items.length) return { error: "Укажите количество для возврата" };
  if (!input.reason.trim()) return { error: "Укажите причину возврата" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("return_sale_items", {
    p_sale_id: input.sale_id,
    p_items: items,
    p_refund_method: input.refund_method,
    p_reason: input.reason,
  });
  if (error) return { error: dbError(error) };
  revalidatePath("/", "layout");
  const r = data as { refund_amount: number; debt_reduction: number };
  return { ok: true, message: `Возврат оформлен: выдано ${r.refund_amount}, долг уменьшен на ${r.debt_reduction}` };
}
