"use client";

import { useActionState, useState } from "react";
import { addPayment, saveCustomer } from "./actions";
import type { Customer } from "@/lib/types";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton, useResetOnSuccess } from "@/components/form";

export function CustomerForm({ customer, onCancel }: { customer?: Customer; onCancel?: () => void }) {
  const [state, action] = useActionState(saveCustomer, null);
  return (
    <form action={action} className="space-y-3">
      {customer && <input type="hidden" name="id" value={customer.id} />}
      <Field label="Имя / компания *">
        <Input name="name" required defaultValue={customer?.name} autoFocus={!customer} />
      </Field>
      <Field label="Телефон">
        <Input name="phone" type="tel" inputMode="tel" defaultValue={customer?.phone ?? ""} placeholder="+992" />
      </Field>
      <Field label="Адрес">
        <Input name="address" defaultValue={customer?.address ?? ""} />
      </Field>
      <Field label="Заметка">
        <Textarea name="note" defaultValue={customer?.note ?? ""} rows={2} />
      </Field>
      <FormMessage state={state} />
      <div className="flex gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
            Отмена
          </Button>
        )}
        <SubmitButton className="flex-1">{customer ? "Сохранить" : "Добавить клиента"}</SubmitButton>
      </div>
    </form>
  );
}

export function NewCustomerToggle() {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <Button onClick={() => setOpen(true)}>
        + <span className="hidden sm:inline">Клиент</span>
      </Button>
    );
  return (
    <div className="fixed inset-0 z-50 grid items-end sm:place-items-center">
      <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
      <Card className="pb-safe relative w-full animate-sheet rounded-b-none p-5 sm:max-w-md sm:animate-fade-up sm:rounded-2xl">
        <p className="mb-4 text-lg font-bold">Новый клиент</p>
        <CustomerForm onCancel={() => setOpen(false)} />
      </Card>
    </div>
  );
}

export function EditCustomer({ customer }: { customer: Customer }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Изменить
      </Button>
    );
  return (
    <div className="fixed inset-0 z-50 grid items-end sm:place-items-center">
      <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
      <Card className="pb-safe relative w-full animate-sheet rounded-b-none p-5 sm:max-w-md sm:rounded-2xl">
        <p className="mb-4 text-lg font-bold">Клиент</p>
        <CustomerForm customer={customer} onCancel={() => setOpen(false)} />
      </Card>
    </div>
  );
}

export function PaymentForm({ customerId, defaultCurrency }: { customerId: string; defaultCurrency: "TJS" | "CNY" }) {
  const [state, action] = useActionState(addPayment, null);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={action} className="space-y-3 p-4 pt-0">
      <input type="hidden" name="customer_id" value={customerId} />
      <div className="grid grid-cols-[1fr_96px] gap-2">
        <Input name="amount" inputMode="decimal" placeholder="Сумма" required />
        <Select name="currency" defaultValue={defaultCurrency}>
          <option>TJS</option>
          <option>CNY</option>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select name="method" defaultValue="cash">
          <option value="cash">Наличные</option>
          <option value="card">Карта</option>
          <option value="transfer">Перевод</option>
        </Select>
        <Input name="note" placeholder="Комментарий" />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingText="Проводим…">
        Принять оплату
      </SubmitButton>
    </form>
  );
}
