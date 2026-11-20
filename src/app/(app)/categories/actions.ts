"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth";
import { dbError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

export async function saveCategory(_: ActionState, fd: FormData): Promise<ActionState> {
  const auth = await authorize("products.edit");
  if ("error" in auth) return auth;
  const id = String(fd.get("id") ?? "");
  const name = String(fd.get("name") ?? "").trim();
  const description = String(fd.get("description") ?? "").trim() || null;
  if (!name) return { error: "Введите название категории" };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("categories").update({ name, description }).eq("id", id)
    : await supabase.from("categories").insert({ name, description });
  if (error) return { error: dbError(error) };
  revalidatePath("/categories");
  return { ok: true, message: id ? "Категория обновлена" : "Категория добавлена" };
}

export async function deleteCategory(_: ActionState, fd: FormData): Promise<ActionState> {
  const auth = await authorize("products.edit");
  if ("error" in auth) return auth;
  const supabase = await createClient();
  const { error } = await supabase.from("categories").delete().eq("id", String(fd.get("id")));
  if (error) return { error: dbError(error) };
  revalidatePath("/categories");
  return { ok: true, message: "Категория удалена. Товары остались без категории." };
}
