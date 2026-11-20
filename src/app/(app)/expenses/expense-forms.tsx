"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { createExpense, deleteExpense } from "./actions";
import { Card, Field, Input, Select } from "@/components/ui";
import { FormMessage, SubmitButton, useResetOnSuccess } from "@/components/form";

export const EXPENSE_CATEGORIES = ["Аренда", "Зарплата", "Транспорт и доставка", "Таможня", "Коммунальные услуги", "Связь и интернет", "Реклама", "Налоги", "Ремонт", "Прочее"];

export function ExpenseForm({ today, categories }: { today: string; categories: string[] }) {
  const [state, action] = useActionState(createExpense, null);
  const ref = useResetOnSuccess(state);
  const all = [...new Set([...EXPENSE_CATEGORIES, ...categories])];
  return (
    <Card className="p-4">
      <p className="mb-3 text-[15px] font-semibold">Новый расход</p>
      <form ref={ref} action={action} className="space-y-3">
        <Field label="Категория">
          <Input name="category" list="expense-cats" required placeholder="Аренда" />
          <datalist id="expense-cats">
            {all.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <div className="grid grid-cols-[1fr_96px] gap-2">
          <Field label="Сумма">
            <Input name="amount" inputMode="decimal" required placeholder="0" />
          </Field>
          <Field label="Валюта">
            <Select name="currency">
              <option>TJS</option>
              <option>CNY</option>
            </Select>
          </Field>
        </div>
        <Field label="Дата">
          <Input name="expense_date" type="date" defaultValue={today} max={today} />
        </Field>
        <Input name="note" placeholder="Комментарий" />
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" name="paid_from_cash" defaultChecked className="size-5 accent-brand-600" />
          Оплачено из кассы
        </label>
        <FormMessage state={state} />
        <SubmitButton className="w-full">Добавить расход</SubmitButton>
      </form>
    </Card>
  );
}

export function DeleteExpenseButton({ id }: { id: string }) {
  const [state, action] = useActionState(deleteExpense, null);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Удалить расход? Если он оплачен из кассы, сумма вернётся в кассу.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button className="rounded-lg p-2 text-slate-300 hover:bg-red-50 hover:text-red-600" aria-label="Удалить" title={state?.error ?? "Удалить"}>
        <Trash2 className="size-4" />
      </button>
    </form>
  );
}
