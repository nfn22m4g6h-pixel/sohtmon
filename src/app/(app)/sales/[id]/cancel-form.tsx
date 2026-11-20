"use client";

import { useActionState, useState } from "react";
import { cancelSale } from "../actions";
import { Button, Card, Input } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";

export function CancelSaleForm({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(cancelSale, null);
  if (!open)
    return (
      <Button variant="danger" onClick={() => setOpen(true)} className="w-full">
        Отменить продажу
      </Button>
    );
  return (
    <Card className="space-y-3 border-red-200 p-4">
      <p className="text-sm font-semibold text-red-700">Отмена вернёт товар на склад и деньги из кассы.</p>
      <form action={action} className="space-y-3">
        <input type="hidden" name="id" value={id} />
        <Input name="reason" placeholder="Причина отмены" required autoFocus />
        <FormMessage state={state} />
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">
            Назад
          </Button>
          <SubmitButton variant="danger" className="flex-1" pendingText="Отмена…">
            Подтвердить
          </SubmitButton>
        </div>
      </form>
    </Card>
  );
}
