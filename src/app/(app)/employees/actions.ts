"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth";
import { dbError } from "@/lib/errors";
import { ROLES, type Role } from "@/lib/rbac";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

function parseRole(v: FormDataEntryValue | null): Role | null {
  return ROLES.includes(String(v) as Role) ? (String(v) as Role) : null;
}

export async function updateEmployee(_: ActionState, fd: FormData): Promise<ActionState> {
  const auth = await authorize("employees.manage");
  if ("error" in auth) return auth;
  const role = parseRole(fd.get("role"));
  if (!role) return { error: "Выберите роль" };
  const supabase = await createClient();
  // Все ограничения (админ не управляет владельцами, последний владелец) проверяет SQL-функция
  const { error } = await supabase.rpc("set_employee", {
    p_user_id: String(fd.get("id")),
    p_role: role,
    p_is_active: fd.get("is_active") === "on",
    p_full_name: String(fd.get("full_name") ?? "") || null,
    p_phone: String(fd.get("phone") ?? ""),
  });
  if (error) return { error: dbError(error) };
  revalidatePath("/employees");
  return { ok: true, message: "Сохранено" };
}

export async function createEmployee(_: ActionState, fd: FormData): Promise<ActionState> {
  const auth = await authorize("employees.manage");
  if ("error" in auth) return auth;
  if (!isAdminConfigured()) return { error: "Не задан SUPABASE_SECRET_KEY — сотрудник может зарегистрироваться сам, затем активируйте его." };
  const email = String(fd.get("email") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const full_name = String(fd.get("full_name") ?? "").trim();
  const role = parseRole(fd.get("role"));
  if (!email || !full_name || !role) return { error: "Заполните имя, email и роль" };
  if (password.length < 8) return { error: "Пароль должен быть не короче 8 символов" };
  if (role === "owner" && auth.profile.role !== "owner") return { error: "Только владелец может добавить владельца" };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } });
  if (error) return { error: /already/i.test(error.message) ? "Этот email уже зарегистрирован" : error.message };

  // Роль назначается от имени текущего пользователя — с проверками в базе
  const supabase = await createClient();
  const { error: roleError } = await supabase.rpc("set_employee", {
    p_user_id: data.user.id,
    p_role: role,
    p_is_active: true,
    p_full_name: full_name,
    p_phone: String(fd.get("phone") ?? ""),
  });
  if (roleError) return { error: `Аккаунт создан, но роль не назначена: ${dbError(roleError)}` };
  revalidatePath("/employees");
  return { ok: true, message: `Сотрудник ${full_name} добавлен` };
}
