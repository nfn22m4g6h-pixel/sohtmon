import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BottomNav, MobileTopBar, Sidebar } from "@/components/nav";
import { PendingAccount } from "@/components/pending-account";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getSession();
  if (!profile) redirect("/login");
  if (!profile.is_active) return <PendingAccount name={profile.full_name} email={profile.email} />;

  const supabase = await createClient();
  const { data: settings } = await supabase.from("settings").select("company_name").maybeSingle();
  const company = settings?.company_name ?? "SOHTMON";
  const name = profile.full_name || profile.email;

  return (
    <div className="min-h-dvh">
      <Sidebar role={profile.role} name={name} company={company} />
      <MobileTopBar company={company} name={name} />
      <main className="mx-auto w-full max-w-6xl px-4 pt-4 pb-28 lg:pl-72 lg:pr-8 lg:pt-8 lg:pb-10 lg:max-w-none xl:pr-12">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
      <BottomNav role={profile.role} />
    </div>
  );
}
