"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn } from "./actions";
import { Field, Input } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signIn, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? "/"} />
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" inputMode="email" required placeholder="name@company.tj" />
      </Field>
      <Field label="Пароль">
        <Input name="password" type="password" autoComplete="current-password" required placeholder="••••••••" />
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full" size="lg" pendingText="Вход…">
        Войти
      </SubmitButton>
      <p className="text-center text-sm text-muted">
        Нет аккаунта?{" "}
        <Link href="/register" className="font-semibold text-brand-600">
          Регистрация
        </Link>
      </p>
    </form>
  );
}
