import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can, type Permission, type Role } from "@/lib/rbac";

export type Profile = {
  id: string;
  full_name: string;
  phone: string | null;
  role: Role;
  is_active: boolean;
  email: string;
};

/** Текущий пользователь и профиль (один запрос на рендер). */
export const getSession = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, phone, role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (!data) return null;
  return { ...data, email: user.email ?? "" } as Profile;
});

/** Для страниц: требует вход, активный профиль и право. */
export async function requirePermission(permission: Permission): Promise<Profile> {
  const profile = await getSession();
  if (!profile) redirect("/login");
  if (!profile.is_active || !can(profile.role, permission)) redirect("/");
  return profile;
}

/** Для Server Actions: возвращает профиль или текст ошибки. */
export async function authorize(permission: Permission): Promise<{ profile: Profile } | { error: string }> {
  const profile = await getSession();
  if (!profile) return { error: "Сессия истекла. Войдите снова." };
  if (!profile.is_active || !can(profile.role, permission)) return { error: "Недостаточно прав для этой операции" };
  return { profile };
}
