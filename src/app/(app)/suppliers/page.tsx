import type { Metadata } from "next";
import { Factory } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/format";
import { cleanSearch } from "@/lib/search";
import type { Currency } from "@/lib/types";
import { Badge, Card, EmptyState, List, ListRow, PageHeader, StatCard } from "@/components/ui";
import { SearchInput } from "@/components/search-input";
import { ExportButton } from "@/components/export-button";
import { NewSupplierButton } from "./supplier-forms";

export const metadata: Metadata = { title: "Поставщики" };

type Balance = { supplier_id: string; currency: Currency; balance: number };

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const profile = await requirePermission("suppliers.view");
  const { q } = await searchParams;
  const search = cleanSearch(q);
  const canPay = can(profile.role, "suppliers.pay");
  const supabase = await createClient();
  let query = supabase.from("suppliers").select("id, name, phone, country").order("name").limit(500);
  if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
  const [{ data: suppliers }, { data: balances }] = await Promise.all([
    query,
    canPay ? supabase.from("supplier_balances").select("supplier_id, currency, balance") : Promise.resolve({ data: [] }),
  ]);
  const list = suppliers ?? [];
  const bal = (balances ?? []) as Balance[];
  const byId = new Map<string, Balance[]>();
  bal.forEach((b) => byId.set(b.supplier_id, [...(byId.get(b.supplier_id) ?? []), b]));
  const total = (cur: Currency) => bal.filter((b) => b.currency === cur && Number(b.balance) > 0).reduce((s, b) => s + Number(b.balance), 0);

  return (
    <div>
      <PageHeader
        title="Поставщики"
        subtitle={`${list.length} поставщиков`}
        action={
          <>
            {canPay && <ExportButton href="/api/export/suppliers" />}
            <NewSupplierButton />
          </>
        }
      />
      {canPay && (
        <div className="stagger mb-4 grid grid-cols-2 gap-3">
          <StatCard label="Мы должны (CNY)" value={money(total("CNY"), "CNY")} tone="red" icon={<Factory className="size-5" />} />
          <StatCard label="Мы должны (TJS)" value={money(total("TJS"))} tone="red" icon={<Factory className="size-5" />} />
        </div>
      )}
      <SearchInput placeholder="Название или телефон" />
      <Card className="overflow-hidden animate-fade-up">
        {list.length === 0 ? (
          <EmptyState icon={<Factory className="size-6" />} title={search ? "Никого не найдено" : "Поставщиков пока нет"} text="Добавьте поставщика, чтобы вести закупки и долги" />
        ) : (
          <List>
            {list.map((s) => {
              const debts = (byId.get(s.id) ?? []).filter((b) => Number(b.balance) > 0);
              return (
                <ListRow
                  key={s.id}
                  href={`/suppliers/${s.id}`}
                  leading={<div className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600"><Factory className="size-5" /></div>}
                  title={s.name}
                  subtitle={[s.country, s.phone].filter(Boolean).join(" · ") || "—"}
                  right={canPay && debts.length ? <span className="text-red-600">{debts.map((d) => money(d.balance, d.currency)).join(" · ")}</span> : undefined}
                  rightSub={canPay ? (debts.length ? "наш долг" : <Badge tone="green">Рассчитались</Badge>) : undefined}
                />
              );
            })}
          </List>
        )}
      </Card>
    </div>
  );
}
