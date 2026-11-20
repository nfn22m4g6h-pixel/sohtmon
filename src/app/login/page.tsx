import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { Notice } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthShell title="Вход в SOHTMON" subtitle="Склад, продажи и финансы в одном месте">
      {!isSupabaseConfigured() && (
        <div className="mb-4">
          <Notice tone="amber">
            Supabase не подключён. Укажите <b>NEXT_PUBLIC_SUPABASE_URL</b> и <b>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</b> в .env.local
          </Notice>
        </div>
      )}
      <LoginForm next={next} />
    </AuthShell>
  );
}
