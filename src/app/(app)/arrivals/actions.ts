"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth";
import { dbError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import type { ActionState, Currency, PaymentMethod } from "@/lib/types";

export type ArrivalInput = {
  items: { product_id: string; qty: number; cost: number }[];
  currency: Currency;
  supplier_id: string | null;
  paid: number;
  paid_method: PaymentMethod;
  extra_costs: { name: string; amount: number; currency: Currency; paid_from_cash: boolean }[];
  note: string;
};

export async function createArrival(input: ArrivalInput): Promise<ActionState> {
  const auth = await authorize("stock.edit");
  if ("error" in auth) return auth;
  if (!input.items?.length) return { error: "Добавьте товары" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_arrival", {
    p_items: input.items,
    p_currency: input.currency,
    p_supplier_id: input.supplier_id,
    p_paid: input.paid,
    p_paid_method: input.paid_method,
    p_extra_costs: input.extra_costs.filter((c) => c.amount > 0),
    p_note: input.note || null,
  });
  if (error) return { error: dbError(error) };
  revalidatePath("/", "layout");
  return { ok: true, id: (data as { id: string }).id };
}
