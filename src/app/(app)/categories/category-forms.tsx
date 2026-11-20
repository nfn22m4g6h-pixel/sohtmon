"use client";

import { useActionState, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { deleteCategory, saveCategory } from "./actions";
import { Card, Input } from "@/components/ui";
import { FormMessage, SubmitButton, useResetOnSuccess } from "@/components/form";

export function NewCategoryForm() {
  const [state, action] = useActionState(saveCategory, null);
  const ref = useResetOnSuccess(state);
  return (
    <Card className="mb-4 p-4">
      <form ref={ref} action={action} className="space-y-3">
        <div className="flex gap-2">
          <Input name="name" placeholder="Новая категория" required />
          <SubmitButton pendingText="…">Добавить</SubmitButton>
        </div>
        <FormMessage state={state} />
      </form>
    </Card>
  );
}

export function CategoryRow({
  id,
  name,
  count,
  canEdit,
}: {
  id: string;
  name: string;
  count: number;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState(saveCategory, null);
  const [delState, delAction] = useActionState(deleteCategory, null);
  if (editing) {
    return (
      <form action={async (fd) => { await action(fd); setEditing(false); }} className="flex gap-2 px-4 py-3">
        <input type="hidden" name="id" value={id} />
        <Input name="name" defaultValue={name} required autoFocus />
        <SubmitButton size="md" pendingText="…">OK</SubmitButton>
      </form>
    );
  }
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <a href={`/products?cat=${id}`} className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium">{name}</p>
          <p className="text-[13px] text-muted">{count} товаров</p>
        </a>
        {canEdit && (
          <>
            <button onClick={() => setEditing(true)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-brand-600" aria-label="Переименовать">
              <Pencil className="size-4" />
            </button>
            <form
              action={delAction}
              onSubmit={(e) => {
                if (!confirm(`Удалить категорию «${name}»?`)) e.preventDefault();
              }}
            >
              <input type="hidden" name="id" value={id} />
              <button className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Удалить">
                <Trash2 className="size-4" />
              </button>
            </form>
          </>
        )}
      </div>
      <div className="mt-2 empty:hidden">
        <FormMessage state={state?.error ? state : delState?.error ? delState : null} />
      </div>
    </div>
  );
}
