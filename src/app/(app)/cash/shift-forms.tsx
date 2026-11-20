"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { closeShift, openShift } from "./actions";
import { money } from "@/lib/format";
import { Card, Field, Input } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";

export function OpenShiftForm({ expectedTjs, expectedCny }: { expectedTjs: number; expectedCny: number }) {
  const [state, action] = useActionState(openShift, null);
  return (
    <Card className="border-brand-200 p-4">
      <p className="text-[15px] font-semibold">Открыть смену</p>
      <p className="mb-3 text-xs text-muted">
        Пересчитайте деньги в кассе. По учёту: {money(expectedTjs)} и {money(expectedCny, "CNY")}. Разница будет записана.
      </p>
      <form action={action} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Наличные TJS">
            <Input name="counted_tjs" inputMode="decimal" required defaultValue={Math.max(expectedTjs, 0)} />
          </Field>
          <Field label="Наличные CNY">
            <Input name="counted_cny" inputMode="decimal" defaultValue={Math.max(expectedCny, 0)} />
          </Field>
        </div>
        <Input name="note" placeholder="Комментарий" />
        <FormMessage state={state} />
        <SubmitButton className="w-full">Открыть смену</SubmitButton>
      </form>
    </Card>
  );
}

export function CloseShiftForm({ expectedTjs, expectedCny }: { expectedTjs: number; expectedCny: number }) {
  const [state, action] = useActionState(closeShift, null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok && state.id) router.push(`/cash/shifts/${state.id}`);
  }, [state, router]);
  return (
    <form action={action} className="space-y-3">
      <p className="text-xs text-muted">Пересчитайте кассу. Должно быть: {money(expectedTjs)} и {money(expectedCny, "CNY")}.</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Факт TJS">
          <Input name="counted_tjs" inputMode="decimal" required placeholder={String(expectedTjs)} />
        </Field>
        <Field label="Факт CNY">
          <Input name="counted_cny" inputMode="decimal" placeholder={String(expectedCny)} />
        </Field>
      </div>
      <Input name="note" placeholder="Комментарий" />
      <FormMessage state={state} />
      <SubmitButton className="w-full" variant="danger" pendingText="Закрытие…">
        Закрыть смену
      </SubmitButton>
    </form>
  );
}
