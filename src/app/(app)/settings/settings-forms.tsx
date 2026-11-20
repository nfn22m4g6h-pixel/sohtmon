"use client";

import { useActionState } from "react";
import { changePassword, saveMyProfile, saveSettings } from "./actions";
import { Card, CardHeader, Field, Input } from "@/components/ui";
import { FormMessage, SubmitButton, useResetOnSuccess } from "@/components/form";

export function CompanyForm({ company, rate, footer }: { company: string; rate: number; footer: string }) {
  const [state, action] = useActionState(saveSettings, null);
  return (
    <Card>
      <CardHeader title="Компания и валюта" />
      <form action={action} className="space-y-3 px-4 pb-4">
        <Field label="Название компании">
          <Input name="company_name" defaultValue={company} />
        </Field>
        <Field label="Курс: 1 CNY = ? TJS" hint="Используется для продаж и закупок в юанях и для отчётов">
          <Input name="cny_rate" inputMode="decimal" defaultValue={rate} required />
        </Field>
        <Field label="Текст внизу чека">
          <Input name="receipt_footer" defaultValue={footer} />
        </Field>
        <FormMessage state={state} />
        <SubmitButton className="w-full">Сохранить</SubmitButton>
      </form>
    </Card>
  );
}

export function ProfileForm({ name, phone }: { name: string; phone: string }) {
  const [state, action] = useActionState(saveMyProfile, null);
  return (
    <Card>
      <CardHeader title="Мой профиль" />
      <form action={action} className="space-y-3 px-4 pb-4">
        <Field label="Имя">
          <Input name="full_name" defaultValue={name} />
        </Field>
        <Field label="Телефон">
          <Input name="phone" type="tel" defaultValue={phone} />
        </Field>
        <FormMessage state={state} />
        <SubmitButton className="w-full" variant="secondary">
          Сохранить профиль
        </SubmitButton>
      </form>
    </Card>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePassword, null);
  const ref = useResetOnSuccess(state);
  return (
    <Card>
      <CardHeader title="Сменить пароль" />
      <form ref={ref} action={action} className="space-y-3 px-4 pb-4">
        <Input name="password" type="password" placeholder="Новый пароль (8+ символов)" minLength={8} autoComplete="new-password" required />
        <FormMessage state={state} />
        <SubmitButton className="w-full" variant="outline">
          Изменить пароль
        </SubmitButton>
      </form>
    </Card>
  );
}
