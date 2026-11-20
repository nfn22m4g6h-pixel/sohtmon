"use client";

import { useActionState, useState } from "react";
import { addSupplierPayment, saveSupplier } from "./actions";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton, useResetOnSuccess } from "@/components/form";

type Supplier = { id: string; name: string; phone: string | null; country: string | null; note: string | null };

export function SupplierForm({ supplier, onCancel }: { supplier?: Supplier; onCancel?: () => void }) {
  const [state, action] = useActionState(saveSupplier, null);
  return (
    <form action={action} className="space-y-3">
      {supplier && <input type="hidden" name="id" value={supplier.id} />}
      <Field label="Название *">
        <Input name="name" required defaultValue={supplier?.name} autoFocus={!supplier} placeholder="Завод в Иу" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Телефон / WeChat">
          <Input name="phone" defaultValue={supplier?.phone ?? ""} />
        </Field>
        <Field label="Страна">
          <Input name="country" defaultValue={supplier?.country ?? "Китай"} />
        </Field>
      </div>
      <Field label="Заметка">
        <Textarea name="note" rows={2} defaultValue={supplier?.note ?? ""} />
      </Field>
      <FormMessage state={state} />
      <div className="flex gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
            Отмена
          </Button>
        )}
        <SubmitButton className="flex-1">{supplier ? "Сохранить" : "Добавить поставщика"}</SubmitButton>
      </div>
    </form>
  );
}

function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid items-end sm:place-items-center">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <Card className="pb-safe relative w-full animate-sheet rounded-b-none p-5 sm:max-w-md sm:rounded-2xl">
        <p className="mb-4 text-lg font-bold">{title}</p>
        {children}
      </Card>
    </div>
  );
}

export function NewSupplierButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        + <span className="hidden sm:inline">Поставщик</span>
      </Button>
      {open && (
        <Sheet title="Новый поставщик" onClose={() => setOpen(false)}>
          <SupplierForm onCancel={() => setOpen(false)} />
        </Sheet>
      )}
    </>
  );
}

export function EditSupplierButton({ supplier }: { supplier: Supplier }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Изменить
      </Button>
      {open && (
        <Sheet title="Поставщик" onClose={() => setOpen(false)}>
          <SupplierForm supplier={supplier} onCancel={() => setOpen(false)} />
        </Sheet>
      )}
    </>
  );
}

export function SupplierPaymentForm({ supplierId, defaultCurrency }: { supplierId: string; defaultCurrency: "TJS" | "CNY" }) {
  const [state, action] = useActionState(addSupplierPayment, null);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={action} className="space-y-3 p-4 pt-0">
      <input type="hidden" name="supplier_id" value={supplierId} />
      <div className="grid grid-cols-[1fr_96px] gap-2">
        <Input name="amount" inputMode="decimal" placeholder="Сумма" required />
        <Select name="currency" defaultValue={defaultCurrency}>
          <option>CNY</option>
          <option>TJS</option>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select name="method" defaultValue="transfer">
          <option value="cash">Наличные (из кассы)</option>
          <option value="transfer">Перевод</option>
          <option value="card">Карта</option>
        </Select>
        <Input name="note" placeholder="Комментарий" />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingText="Проводим…">
        Оплатить поставщику
      </SubmitButton>
    </form>
  );
}
