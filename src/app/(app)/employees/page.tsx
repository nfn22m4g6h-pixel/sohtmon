import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { ROLE_LABELS, type Role } from "@/lib/rbac";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, List, Notice, PageHeader } from "@/components/ui";
import { EmployeeRow, NewEmployeeForm } from "./employee-forms";

export const metadata: Metadata = { title: "Сотрудники" };

const ROLE_HELP: Record<Role, string> = {
  owner: "полный доступ, управление владельцами",
  admin: "всё, кроме управления владельцами",
  manager: "товары, склад, продажи, клиенты, расходы, отчёты",
  cashier: "продажи, клиенты, долги, касса",
  warehouse: "товары, категории, приход, корректировки",
};

export default async function EmployeesPage() {
  const profile = await requirePermission("employees.manage");
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, full_name, phone, role, is_active, created_at").order("is_active").order("created_at");
  const list = (data ?? []) as { id: string; full_name: string; phone: string | null; role: Role; is_active: boolean }[];
  const pending = list.filter((e) => !e.is_active).length;

  return (
    <div>
      <PageHeader title="Сотрудники" subtitle={`${list.filter((e) => e.is_active).length} активных${pending ? ` · ${pending} ожидают` : ""}`} />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="h-fit overflow-hidden">
          <List>
            {list.map((e) => (
              <EmployeeRow key={e.id} emp={e} me={profile.id} myRole={profile.role} />
            ))}
          </List>
        </Card>
        <div className="space-y-4">
          {isAdminConfigured() ? (
            <NewEmployeeForm myRole={profile.role} />
          ) : (
            <Notice tone="blue">
              Сотрудник регистрируется сам на странице входа → «Регистрация», затем вы назначаете роль и включаете доступ здесь.
            </Notice>
          )}
          <Card>
            <CardHeader title="Роли" />
            <ul className="space-y-2 px-4 pb-4 text-sm">
              {(Object.keys(ROLE_HELP) as Role[]).map((r) => (
                <li key={r}>
                  <b>{ROLE_LABELS[r]}</b> — <span className="text-muted">{ROLE_HELP[r]}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
