"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import type { ActionState } from "@/lib/types";

function safeNext(next: FormDataEntryValue | null) {
  const n = String(next ?? "/");
  return n.startsWith("/") && !n.startsWith("//") ? n : "/";
}

export async function signIn(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!isSupabaseConfigured()) return { error: "Supabase не настроен. Заполните .env.local" };
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Введите email и пароль" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (/invalid login credentials/i.test(error.message)) return { error: "Неверный email или пароль" };
    if (/email not confirmed/i.test(error.message)) return { error: "Подтвердите email по ссылке из письма" };
    return { error: error.message };
  }
  redirect(safeNext(formData.get("next")));
}

export async function signUp(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!isSupabaseConfigured()) return { error: "Supabase не настроен. Заполните .env.local" };
  const full_name = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!full_name) return { error: "Введите имя" };
  if (password.length < 8) return { error: "Пароль должен быть не короче 8 символов" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name } } });
  if (error) {
    if (/already registered/i.test(error.message)) return { error: "Этот email уже зарегистрирован" };
    return { error: error.message };
  }
  if (!data.session) {
    return { ok: true, message: "Аккаунт создан. Подтвердите email по ссылке из письма, затем войдите." };
  }
  redirect("/");
}
