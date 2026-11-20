"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth";
import { dbError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import type { ActionState, Currency } from "@/lib/types";

export type ArrivalInput = {
  items: { product_id: string; qty: number; cost: number }[];
  currency: Currency;
  supplier: string;
  paid_from_cash: boolean;
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
    p_supplier: input.supplier || null,
    p_paid_from_cash: input.paid_from_cash,
    p_note: input.note || null,
  });
  if (error) return { error: dbError(error) };
  revalidatePath("/", "layout");
  return { ok: true, id: (data as { id: string }).id };
}
