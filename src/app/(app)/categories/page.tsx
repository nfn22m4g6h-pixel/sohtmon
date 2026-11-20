import type { Metadata } from "next";
import { Tags } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { Card, EmptyState, List, PageHeader } from "@/components/ui";
import { CategoryRow, NewCategoryForm } from "./category-forms";

export const metadata: Metadata = { title: "Категории" };

export default async function CategoriesPage() {
  const profile = await requirePermission("products.view");
  const supabase = await createClient();
  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase.from("categories").select("id, name").order("name"),
    supabase.from("products").select("category_id").eq("is_active", true),
  ]);
  const counts = new Map<string, number>();
  (products ?? []).forEach((p) => p.category_id && counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1));
  const canEdit = can(profile.role, "products.edit");

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Категории" subtitle={`${categories?.length ?? 0} категорий`} />
      {canEdit && <NewCategoryForm />}
      <Card className="overflow-hidden animate-fade-up">
        {(categories ?? []).length === 0 ? (
          <EmptyState icon={<Tags className="size-6" />} title="Категорий пока нет" text="Группируйте товары для быстрого поиска" />
        ) : (
          <List>
            {(categories ?? []).map((c) => (
              <CategoryRow key={c.id} id={c.id} name={c.name} count={counts.get(c.id) ?? 0} canEdit={canEdit} />
            ))}
          </List>
        )}
      </Card>
    </div>
  );
}
