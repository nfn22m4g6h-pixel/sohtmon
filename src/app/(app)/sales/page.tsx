import type { Metadata } from "next";
import { Plus, Receipt } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { dateTime, money, PAYMENT_LABEL, periodRange, presetPeriod } from "@/lib/format";
import { cleanSearch } from "@/lib/search";
import type { Sale } from "@/lib/types";
import { Badge, Card, Chips, EmptyState, LinkButton, List, ListRow, PageHeader } from "@/components/ui";
import { SearchInput } from "@/components/search-input";

export const metadata: Metadata = { title: "История продаж" };

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ p?: string; q?: string; status?: string }> }) {
  const profile = await requirePermission("sales.view");
  const { p = "7d", q, status } = await searchParams;
  const period = presetPeriod(p);
  const range = periodRange(period.from, period.to);
  const supabase = await createClient();
  const search = cleanSearch(q);

  let query = supabase
    .from("sales")
    .select("id, number, total, paid, debt, currency, rate, status, payment_method, created_at, customers(name), profiles:created_by(full_name)")
    .gte("created_at", range.start)
    .lt("created_at", range.end)
    .order("created_at", { ascending: false })
    .limit(200);
  if (status === "debt") query = query.gt("debt", 0).eq("status", "completed");
  if (status === "cancelled") query = query.eq("status", "cancelled");
  if (search) {
    if (/^\d+$/.test(search)) query = query.eq("number", Number(search));
    else {
      const { data: found } = await supabase.from("customers").select("id").ilike("name", `%${search}%`).limit(50);
      query = query.in("customer_id", (found ?? []).map((c) => c.id));
    }
  }
  const { data } = await query;
  const sales = (data ?? []) as unknown as Sale[];
  const completed = sales.filter((s) => s.status === "completed");
  const totalTjs = completed.reduce((s, x) => s + Number(x.total) * Number(x.rate), 0);

  const href = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    Object.entries({ p, q: search || undefined, status, ...extra }).forEach(([k, v]) => v && params.set(k, v));
    return `/sales?${params}`;
  };

  return (
    <div>
      <PageHeader
        title="История продаж"
        subtitle={`${period.label}: ${completed.length} продаж · ${money(totalTjs)}`}
        action={
          can(profile.role, "sales.create") && (
            <LinkButton href="/sales/new">
              <Plus className="size-4" /> <span className="hidden sm:inline">Продажа</span>
            </LinkButton>
          )
        }
      />
      <SearchInput placeholder="Номер чека или имя клиента" />
      <Chips
        active={p}
        items={[
          { key: "today", label: "Сегодня", href: href({ p: "today" }) },
          { key: "7d", label: "7 дней", href: href({ p: "7d" }) },
          { key: "30d", label: "30 дней", href: href({ p: "30d" }) },
          { key: "month", label: "Месяц", href: href({ p: "month" }) },
          { key: "all", label: "Всё время", href: href({ p: "all" }) },
        ]}
      />
      <Chips
        active={status ?? ""}
        items={[
          { key: "", label: "Все", href: href({ status: undefined }) },
          { key: "debt", label: "С долгом", href: href({ status: "debt" }) },
          { key: "cancelled", label: "Отменённые", href: href({ status: "cancelled" }) },
        ]}
      />
      <Card className="overflow-hidden animate-fade-up">
        {sales.length === 0 ? (
          <EmptyState icon={<Receipt className="size-6" />} title="Продаж не найдено" text="Измените период или фильтр" />
        ) : (
          <List>
            {sales.map((s) => (
              <ListRow
                key={s.id}
                href={`/sales/${s.id}`}
                leading={
                  <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-xs font-bold text-brand-700">
                    №{s.number}
                  </div>
                }
                title={s.customers?.name ?? "Розничный покупатель"}
                subtitle={`${dateTime(s.created_at)} · ${PAYMENT_LABEL[s.payment_method]}${s.profiles?.full_name ? ` · ${s.profiles.full_name}` : ""}`}
                right={<span className={s.status === "cancelled" ? "text-slate-400 line-through" : ""}>{money(s.total, s.currency)}</span>}
                rightSub={
                  s.status === "cancelled" ? (
                    <Badge tone="red">Отменена</Badge>
                  ) : Number(s.debt) > 0 ? (
                    <Badge tone="amber">долг {money(s.debt, s.currency)}</Badge>
                  ) : (
                    <Badge tone="green">Оплачено</Badge>
                  )
                }
              />
            ))}
          </List>
        )}
      </Card>
    </div>
  );
}
