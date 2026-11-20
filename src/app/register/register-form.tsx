"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp } from "../login/actions";
import { Field, Input } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";

export function RegisterForm() {
  const [state, action] = useActionState(signUp, null);
  return (
    <form action={action} className="space-y-4">
      <Field label="Имя и фамилия">
        <Input name="full_name" autoComplete="name" required placeholder="Салим Рустамов" />
      </Field>
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" inputMode="email" required placeholder="name@company.tj" />
      </Field>
      <Field label="Пароль" hint="Не короче 8 символов">
        <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full" size="lg" pendingText="Создание…">
        Создать аккаунт
      </SubmitButton>
      <p className="text-center text-sm text-muted">
        Уже есть аккаунт?{" "}
        <Link href="/login" className="font-semibold text-brand-600">
          Войти
        </Link>
      </p>
    </form>
  );
}
