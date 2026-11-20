import type { Metadata } from "next";
import { Package, Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { money, qty } from "@/lib/format";
import { cleanSearch } from "@/lib/search";
import type { Category, Product } from "@/lib/types";
import { Badge, Card, Chips, EmptyState, LinkButton, List, ListRow, Notice, PageHeader } from "@/components/ui";
import { SearchInput } from "@/components/search-input";

export const metadata: Metadata = { title: "Товары и склад" };

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string; filter?: string; error?: string }>;
}) {
  const profile = await requirePermission("products.view");
  const { q, cat, filter, error } = await searchParams;
  const supabase = await createClient();
  const search = cleanSearch(q);

  let query = supabase
    .from(filter === "low" ? "low_stock_products" : "products")
    .select("id, name, sku, barcode, unit, stock, min_stock, sale_price, sale_currency, avg_cost_tjs, is_active, category_id")
    .order("name")
    .limit(300);
  if (search) query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%,barcode.eq.${search}`);
  if (cat) query = query.eq("category_id", cat);
  if (filter === "inactive") query = query.eq("is_active", false);
  else if (filter !== "all") query = query.eq("is_active", true);

  const [{ data: products, error: loadError }, { data: categories }] = await Promise.all([
    query,
    supabase.from("categories").select("id, name").order("name"),
  ]);
  const list = (products ?? []) as Product[];
  const cats = (categories ?? []) as Category[];
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const showCost = can(profile.role, "products.cost");
  const stockValue = list.reduce((s, p) => s + Math.max(Number(p.stock), 0) * Number(p.avg_cost_tjs), 0);

  const base = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q: search || undefined, cat, filter, ...extra };
    Object.entries(merged).forEach(([k, v]) => v && p.set(k, v));
    return `/products?${p.toString()}`;
  };

  return (
    <div>
      <PageHeader
        title="Товары и склад"
        subtitle={`${list.length} позиций${showCost ? ` · склад по себестоимости ${money(stockValue)}` : ""}`}
        action={
          can(profile.role, "products.edit") && (
            <LinkButton href="/products/new" size="md">
              <Plus className="size-4" /> <span className="hidden sm:inline">Товар</span>
            </LinkButton>
          )
        }
      />
      {error && <div className="mb-4"><Notice tone="red">{error}</Notice></div>}
      <SearchInput placeholder="Название, артикул или штрихкод" />
      <Chips
        active={filter ?? "active"}
        items={[
          { key: "active", label: "Активные", href: base({ filter: undefined }) },
          { key: "low", label: "Мало на складе", href: base({ filter: "low" }) },
          { key: "inactive", label: "Скрытые", href: base({ filter: "inactive" }) },
          { key: "all", label: "Все", href: base({ filter: "all" }) },
        ]}
      />
      {cats.length > 0 && (
        <Chips
          active={cat ?? ""}
          items={[{ key: "", label: "Все категории", href: base({ cat: undefined }) }, ...cats.map((c) => ({ key: c.id, label: c.name, href: base({ cat: c.id }) }))]}
        />
      )}
      {loadError && <Notice tone="red">{loadError.message}</Notice>}
      <Card className="overflow-hidden animate-fade-up">
        {list.length === 0 ? (
          <EmptyState
            icon={<Package className="size-6" />}
            title={search ? "Ничего не найдено" : "Товаров пока нет"}
            text={search ? "Попробуйте другой запрос" : "Добавьте первый товар, чтобы начать продажи"}
            action={can(profile.role, "products.edit") && !search ? <LinkButton href="/products/new">Добавить товар</LinkButton> : undefined}
          />
        ) : (
          <List>
            {list.map((p) => {
              const out = Number(p.stock) <= 0;
              const low = !out && Number(p.stock) <= Number(p.min_stock);
              return (
                <ListRow
                  key={p.id}
                  href={`/products/${p.id}`}
                  leading={
                    <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-sm font-bold text-brand-600">
                      {p.name.slice(0, 2).toUpperCase()}
                    </div>
                  }
                  title={
                    <span className={p.is_active ? "" : "text-slate-400"}>
                      {p.name}
                    </span>
                  }
                  subtitle={[p.sku, p.category_id ? catName.get(p.category_id) : null].filter(Boolean).join(" · ") || "—"}
                  right={money(p.sale_price, p.sale_currency)}
                  rightSub={
                    <Badge tone={out ? "red" : low ? "amber" : "green"} className="mt-0.5">
                      {qty(p.stock)} {p.unit}
                    </Badge>
                  }
                />
              );
            })}
          </List>
        )}
      </Card>
    </div>
  );
}
