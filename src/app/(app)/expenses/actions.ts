"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth";
import { dbError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

export async function createExpense(_: ActionState, fd: FormData): Promise<ActionState> {
  const auth = await authorize("expenses.view");
  if ("error" in auth) return auth;
  const amount = Number(String(fd.get("amount") ?? "").replace(",", "."));
  if (!(amount > 0)) return { error: "Введите сумму больше нуля" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_expense", {
    p_category: String(fd.get("category") ?? ""),
    p_amount: amount,
    p_currency: fd.get("currency") === "CNY" ? "CNY" : "TJS",
    p_expense_date: String(fd.get("expense_date") ?? "") || null,
    p_paid_from_cash: fd.get("paid_from_cash") === "on",
    p_note: String(fd.get("note") ?? "") || null,
  });
  if (error) return { error: dbError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Расход добавлен" };
}

export async function deleteExpense(_: ActionState, fd: FormData): Promise<ActionState> {
  const auth = await authorize("expenses.delete");
  if ("error" in auth) return auth;
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_expense", { p_expense_id: String(fd.get("id")) });
  if (error) return { error: dbError(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}
