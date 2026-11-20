import type { Metadata } from "next";
import { BellOff, PackageX, UserPlus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { qty } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, List, ListRow, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Уведомления" };

export default async function NotificationsPage() {
  const profile = await requirePermission("dashboard.view");
  const supabase = await createClient();
  const canStaff = can(profile.role, "employees.manage");
  const [{ data: low }, { data: pending }] = await Promise.all([
    supabase.from("low_stock_products").select("id, name, sku, stock, min_stock, unit").order("stock").limit(200),
    canStaff ? supabase.from("profiles").select("id, full_name, created_at").eq("is_active", false).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const lowList = low ?? [];
  const pendingList = (pending ?? []) as { id: string; full_name: string }[];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Уведомления" subtitle={`${lowList.length + pendingList.length} активных`} />
      {lowList.length + pendingList.length === 0 ? (
        <Card>
          <EmptyState icon={<BellOff className="size-6" />} title="Всё спокойно" text="Нет заканчивающихся товаров и новых заявок" />
        </Card>
      ) : (
        <div className="space-y-4">
          {pendingList.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader title="Новые сотрудники ждут активации" />
              <List>
                {pendingList.map((e) => (
                  <ListRow
                    key={e.id}
                    href="/employees"
                    leading={<div className="grid size-10 place-items-center rounded-full bg-brand-50 text-brand-600"><UserPlus className="size-5" /></div>}
                    title={e.full_name || "Без имени"}
                    subtitle="Назначьте роль и включите доступ"
                  />
                ))}
              </List>
            </Card>
          )}
          {lowList.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader title="Заканчиваются на складе" subtitle="Остаток не выше минимального" />
              <List>
                {lowList.map((p) => (
                  <ListRow
                    key={p.id}
                    href={`/products/${p.id}`}
                    leading={<div className="grid size-10 place-items-center rounded-full bg-amber-50 text-amber-600"><PackageX className="size-5" /></div>}
                    title={p.name}
                    subtitle={`Минимум ${qty(p.min_stock)} ${p.unit}${p.sku ? ` · ${p.sku}` : ""}`}
                    right={<Badge tone={Number(p.stock) <= 0 ? "red" : "amber"}>{qty(p.stock)} {p.unit}</Badge>}
                  />
                ))}
              </List>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
