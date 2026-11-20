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

function amount(fd: FormData, key: string) {
  const raw = String(fd.get(key) ?? "").replace(",", ".").replace(/\s/g, "");
  return raw === "" ? 0 : Number(raw);
}

export async function openShift(_: ActionState, fd: FormData): Promise<ActionState> {
  const auth = await authorize("cash.edit");
  if ("error" in auth) return auth;
  const tjs = amount(fd, "counted_tjs");
  const cny = amount(fd, "counted_cny");
  if (!Number.isFinite(tjs) || !Number.isFinite(cny) || tjs < 0 || cny < 0) return { error: "Введите пересчитанные суммы" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("open_shift", { p_counted_tjs: tjs, p_counted_cny: cny, p_note: String(fd.get("note") ?? "") || null });
  if (error) return { error: dbError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Смена открыта" };
}

export async function closeShift(_: ActionState, fd: FormData): Promise<ActionState> {
  const auth = await authorize("cash.edit");
  if ("error" in auth) return auth;
  const tjs = amount(fd, "counted_tjs");
  const cny = amount(fd, "counted_cny");
  if (!Number.isFinite(tjs) || !Number.isFinite(cny) || tjs < 0 || cny < 0) return { error: "Введите пересчитанные суммы" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("close_shift", { p_counted_tjs: tjs, p_counted_cny: cny, p_note: String(fd.get("note") ?? "") || null });
  if (error) return { error: dbError(error) };
  revalidatePath("/", "layout");
  return { ok: true, id: (data as { id: string }).id, message: "Смена закрыта" };
}
