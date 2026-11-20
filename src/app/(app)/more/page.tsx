import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { MoreMenu } from "./more-menu";

export const metadata: Metadata = { title: "Меню" };

export default async function MorePage() {
  const profile = await requirePermission("dashboard.view");
  return (
    <div>
      <PageHeader title="Все разделы" />
      <MoreMenu role={profile.role} />
    </div>
  );
}
