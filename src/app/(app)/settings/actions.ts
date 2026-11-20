"use server";

import { revalidatePath } from "next/cache";
import { authorize, getSession } from "@/lib/auth";
import { dbError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

export async function saveSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  const auth = await authorize("settings.edit");
  if ("error" in auth) return auth;
  const cny_rate = Number(String(fd.get("cny_rate") ?? "").replace(",", "."));
  if (!(cny_rate > 0)) return { error: "Курс должен быть больше нуля" };
  const company_name = String(fd.get("company_name") ?? "").trim() || "SOHTMON";
  const receipt_footer = String(fd.get("receipt_footer") ?? "").trim();
  const supabase = await createClient();
  const { data, error } = await supabase.from("settings").update({ cny_rate, company_name, receipt_footer }).eq("id", 1).select("id");
  if (error) return { error: dbError(error) };
  if (!data?.length) return { error: "Недостаточно прав для изменения настроек" };
  revalidatePath("/", "layout");
  return { ok: true, message: "Настройки сохранены" };
}

export async function saveMyProfile(_: ActionState, fd: FormData): Promise<ActionState> {
  if (!(await getSession())) return { error: "Сессия истекла" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_profile", {
    p_full_name: String(fd.get("full_name") ?? ""),
    p_phone: String(fd.get("phone") ?? ""),
  });
  if (error) return { error: dbError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Профиль обновлён" };
}

export async function changePassword(_: ActionState, fd: FormData): Promise<ActionState> {
  const password = String(fd.get("password") ?? "");
  if (password.length < 8) return { error: "Пароль должен быть не короче 8 символов" };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  return { ok: true, message: "Пароль изменён" };
}
