import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BottomNav, MobileTopBar, Sidebar } from "@/components/nav";
import { PendingAccount } from "@/components/pending-account";
import { can } from "@/lib/rbac";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getSession();
  if (!profile) redirect("/login");
  if (!profile.is_active) return <PendingAccount name={profile.full_name} email={profile.email} />;

  const supabase = await createClient();
  const canStaff = can(profile.role, "employees.manage");
  const [{ data: settings }, { count: lowCount }, { count: pendingCount }] = await Promise.all([
    supabase.from("settings").select("company_name").maybeSingle(),
    supabase.from("low_stock_products").select("id", { count: "exact", head: true }),
    canStaff
      ? supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_active", false)
      : Promise.resolve({ count: 0 }),
  ]);
  const alerts = (lowCount ?? 0) + (pendingCount ?? 0);
  const company = settings?.company_name ?? "SOHTMON";
  const name = profile.full_name || profile.email;

  return (
    <div className="min-h-dvh">
      <Sidebar role={profile.role} name={name} company={company} alerts={alerts} />
      <MobileTopBar company={company} name={name} alerts={alerts} />
      <main className="mx-auto w-full max-w-6xl px-4 pt-4 pb-28 lg:pl-72 lg:pr-8 lg:pt-8 lg:pb-10 lg:max-w-none xl:pr-12">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
      <BottomNav role={profile.role} />
    </div>
  );
}
