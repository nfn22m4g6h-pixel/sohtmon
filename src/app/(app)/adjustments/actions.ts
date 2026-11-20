"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth";
import { dbError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

const REASONS = ["initial", "inventory", "damage", "loss", "return", "other"];

export async function createAdjustment(_: ActionState, fd: FormData): Promise<ActionState> {
  const auth = await authorize("stock.edit");
  if ("error" in auth) return auth;
  const productId = String(fd.get("product_id") ?? "");
  const mode = String(fd.get("mode") ?? "delta");
  const reason = String(fd.get("reason") ?? "");
  const value = Number(String(fd.get("value") ?? "").replace(",", "."));
  if (!productId) return { error: "Выберите товар" };
  if (!REASONS.includes(reason)) return { error: "Выберите причину" };
  if (!Number.isFinite(value)) return { error: "Введите число" };

  const supabase = await createClient();
  let delta = value;
  if (mode === "actual") {
    if (value < 0) return { error: "Фактический остаток не может быть отрицательным" };
    const { data: p } = await supabase.from("products").select("stock").eq("id", productId).single();
    delta = Math.round((value - Number(p?.stock ?? 0)) * 1000) / 1000;
    if (delta === 0) return { error: "Фактический остаток совпадает с учётным — корректировка не нужна" };
  } else if (["damage", "loss"].includes(reason) && delta > 0) {
    delta = -delta; // списание всегда уменьшает остаток
  }

  const { error } = await supabase.rpc("create_adjustment", {
    p_product_id: productId,
    p_qty_delta: delta,
    p_reason: reason,
    p_note: String(fd.get("note") ?? "") || null,
  });
  if (error) return { error: dbError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: `Остаток изменён на ${delta > 0 ? "+" : ""}${delta}` };
}
