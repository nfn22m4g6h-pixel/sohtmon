import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions";
import { Button, Card, PageHeader } from "@/components/ui";
import { CompanyForm, PasswordForm, ProfileForm } from "./settings-forms";

export const metadata: Metadata = { title: "Настройки" };

export default async function SettingsPage() {
  const profile = await requirePermission("dashboard.view");
  const supabase = await createClient();
  const { data: s } = await supabase.from("settings").select("company_name, cny_rate, receipt_footer").maybeSingle();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Настройки" />
      <Card className="mb-4 flex items-center gap-4 p-4">
        <div className="grid size-14 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xl font-bold text-white">
          {(profile.full_name || profile.email).slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{profile.full_name}</p>
          <p className="truncate text-sm text-muted">{profile.email}</p>
          <p className="text-sm font-medium text-brand-600">{ROLE_LABELS[profile.role]}</p>
        </div>
      </Card>
      <div className="space-y-4">
        {can(profile.role, "settings.edit") && s && <CompanyForm company={s.company_name} rate={Number(s.cny_rate)} footer={s.receipt_footer} />}
        {!can(profile.role, "settings.edit") && s && (
          <Card className="p-4 text-sm">
            Текущий курс: <b>1 CNY = {Number(s.cny_rate)} TJS</b>
          </Card>
        )}
        <ProfileForm name={profile.full_name} phone={profile.phone ?? ""} />
        <PasswordForm />
        <form action={signOut}>
          <Button variant="danger" className="w-full">
            <LogOut className="size-4" /> Выйти из аккаунта
          </Button>
        </form>
        <p className="pb-4 text-center text-xs text-slate-400">SOHTMON ERP 1.0</p>
      </div>
    </div>
  );
}
