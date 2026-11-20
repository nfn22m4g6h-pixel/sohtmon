import type { Metadata } from "next";
import { Users } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/format";
import { cleanSearch } from "@/lib/search";
import type { Customer, CustomerBalance } from "@/lib/types";
import { Badge, Card, EmptyState, List, ListRow, PageHeader } from "@/components/ui";
import { SearchInput } from "@/components/search-input";
import { NewCustomerToggle } from "./customer-forms";

export const metadata: Metadata = { title: "Клиенты" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const profile = await requirePermission("customers.view");
  const { q } = await searchParams;
  const search = cleanSearch(q);
  const supabase = await createClient();
  let query = supabase.from("customers").select("*").order("name").limit(300);
  if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
  const [{ data: customers }, { data: balances }] = await Promise.all([query, supabase.from("customer_balances").select("*")]);
  const list = (customers ?? []) as Customer[];
  const byCustomer = new Map<string, CustomerBalance[]>();
  ((balances ?? []) as CustomerBalance[]).forEach((b) => byCustomer.set(b.customer_id, [...(byCustomer.get(b.customer_id) ?? []), b]));

  return (
    <div>
      <PageHeader title="Клиенты" subtitle={`${list.length} клиентов`} action={can(profile.role, "customers.edit") && <NewCustomerToggle />} />
      <SearchInput placeholder="Имя или телефон" />
      <Card className="overflow-hidden animate-fade-up">
        {list.length === 0 ? (
          <EmptyState icon={<Users className="size-6" />} title={search ? "Никого не найдено" : "Клиентов пока нет"} />
        ) : (
          <List>
            {list.map((c) => {
              const debts = (byCustomer.get(c.id) ?? []).filter((b) => Number(b.balance) > 0);
              return (
                <ListRow
                  key={c.id}
                  href={`/customers/${c.id}`}
                  leading={
                    <div className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-100 font-bold text-brand-700">
                      {c.name.slice(0, 1).toUpperCase()}
                    </div>
                  }
                  title={c.name}
                  subtitle={c.phone ?? c.address ?? "—"}
                  right={debts.length ? <span className="text-amber-600">{debts.map((d) => money(d.balance, d.currency)).join(" · ")}</span> : undefined}
                  rightSub={debts.length ? "долг" : <Badge tone="green">Без долга</Badge>}
                />
              );
            })}
          </List>
        )}
      </Card>
    </div>
  );
}
