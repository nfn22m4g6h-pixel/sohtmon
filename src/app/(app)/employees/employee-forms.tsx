"use client";

import { useActionState, useState } from "react";
import { createEmployee, updateEmployee } from "./actions";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/rbac";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";
import { FormMessage, SubmitButton, useResetOnSuccess } from "@/components/form";

type Emp = { id: string; full_name: string; phone: string | null; role: Role; is_active: boolean };

export function EmployeeRow({ emp, me, myRole }: { emp: Emp; me: string; myRole: Role }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(updateEmployee, null);
  const locked = myRole === "admin" && (emp.role === "owner" || (emp.role === "admin" && emp.id !== me));
  const roles = myRole === "owner" ? ROLES : ROLES.filter((r) => r !== "owner");
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <div className={`grid size-11 shrink-0 place-items-center rounded-full font-bold ${emp.is_active ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-400"}`}>
          {(emp.full_name || "?").slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium">
            {emp.full_name || "Без имени"} {emp.id === me && <span className="text-xs text-muted">(вы)</span>}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <Badge tone={emp.role === "owner" ? "blue" : "gray"}>{ROLE_LABELS[emp.role]}</Badge>
            {!emp.is_active && <Badge tone="amber">Ожидает активации / отключён</Badge>}
            {emp.phone && <span className="text-xs text-muted">{emp.phone}</span>}
          </div>
        </div>
        {!locked && (
          <Button size="sm" variant={open ? "outline" : "secondary"} onClick={() => setOpen(!open)}>
            {open ? "Закрыть" : "Изменить"}
          </Button>
        )}
      </div>
      {open && (
        <form action={action} className="mt-3 space-y-3 rounded-xl bg-slate-50 p-3 animate-fade-up">
          <input type="hidden" name="id" value={emp.id} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Имя">
              <Input name="full_name" defaultValue={emp.full_name} />
            </Field>
            <Field label="Телефон">
              <Input name="phone" type="tel" defaultValue={emp.phone ?? ""} />
            </Field>
          </div>
          <Field label="Роль">
            <Select name="role" defaultValue={emp.role}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" name="is_active" defaultChecked={emp.is_active} className="size-5 accent-brand-600" />
            Доступ разрешён
          </label>
          <FormMessage state={state} />
          <SubmitButton className="w-full">Сохранить</SubmitButton>
        </form>
      )}
    </div>
  );
}

export function NewEmployeeForm({ myRole }: { myRole: Role }) {
  const [state, action] = useActionState(createEmployee, null);
  const ref = useResetOnSuccess(state);
  const roles = myRole === "owner" ? ROLES : ROLES.filter((r) => r !== "owner");
  return (
    <Card className="p-4">
      <p className="mb-3 text-[15px] font-semibold">Новый сотрудник</p>
      <form ref={ref} action={action} className="space-y-3">
        <Input name="full_name" placeholder="Имя и фамилия" required />
        <Input name="email" type="email" placeholder="Email для входа" required autoComplete="off" />
        <Input name="password" type="text" placeholder="Временный пароль (8+ символов)" minLength={8} required autoComplete="off" />
        <div className="grid grid-cols-2 gap-2">
          <Input name="phone" type="tel" placeholder="Телефон" />
          <Select name="role" defaultValue="cashier">
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </div>
        <FormMessage state={state} />
        <SubmitButton className="w-full">Создать аккаунт</SubmitButton>
      </form>
    </Card>
  );
}
