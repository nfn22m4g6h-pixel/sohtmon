"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth";
import { dbError, isMissingSchema, UPGRADE_HINT } from "@/lib/errors";
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
  if (error && isMissingSchema(error)) {
    // База ещё версии 1.0: проводим приход старой функцией (без поставщика, долга и доп. расходов)
    const extras = input.extra_costs.filter((c) => c.amount > 0);
    if (input.supplier_id || extras.length || input.paid < input.items.reduce((s, i) => s + i.qty * i.cost, 0) - 0.005) {
      return { error: UPGRADE_HINT };
    }
    const legacy = await supabase.rpc("create_arrival", {
      p_items: input.items,
      p_currency: input.currency,
      p_supplier: null,
      p_paid_from_cash: input.paid_method === "cash" && input.paid > 0,
      p_note: input.note || null,
    });
    if (legacy.error) return { error: dbError(legacy.error) };
    revalidatePath("/", "layout");
    return { ok: true, id: (legacy.data as { id: string }).id };
  }
  if (error) return { error: dbError(error) };
  revalidatePath("/", "layout");
  return { ok: true, id: (data as { id: string }).id };
}
