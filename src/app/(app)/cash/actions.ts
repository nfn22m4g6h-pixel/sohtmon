"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth";
import { dbError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

export async function addCashOperation(_: ActionState, fd: FormData): Promise<ActionState> {
  const auth = await authorize("cash.edit");
  if ("error" in auth) return auth;
  const amount = Number(String(fd.get("amount") ?? "").replace(",", "."));
  if (!(amount > 0)) return { error: "Введите сумму больше нуля" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_cash_operation", {
    p_direction: fd.get("direction") === "out" ? "out" : "in",
    p_amount: amount,
    p_currency: fd.get("currency") === "CNY" ? "CNY" : "TJS",
    p_note: String(fd.get("note") ?? ""),
  });
  if (error) return { error: dbError(error) };
  revalidatePath("/cash");
  revalidatePath("/");
  return { ok: true, message: "Операция проведена" };
}
