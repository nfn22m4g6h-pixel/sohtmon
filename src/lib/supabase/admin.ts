import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/env";

const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export function isAdminConfigured() {
  return SUPABASE_URL.startsWith("http") && SERVICE_KEY.length > 0;
}

/** Клиент с сервисным ключом — только на сервере, только после проверки роли. */
export function createAdminClient() {
  if (!isAdminConfigured()) throw new Error("SUPABASE_SECRET_KEY не задан");
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
