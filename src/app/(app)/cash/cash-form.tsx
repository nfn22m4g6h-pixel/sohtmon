"use client";

import { useActionState, useState } from "react";
import { addCashOperation } from "./actions";
import { Card, cn, Input, Select } from "@/components/ui";
import { FormMessage, SubmitButton, useResetOnSuccess } from "@/components/form";

export function CashForm() {
  const [state, action] = useActionState(addCashOperation, null);
  const ref = useResetOnSuccess(state);
  const [dir, setDir] = useState<"in" | "out">("in");
  return (
    <Card className="p-4">
      <p className="mb-3 text-[15px] font-semibold">Ручная операция</p>
      <form ref={ref} action={action} className="space-y-3">
        <input type="hidden" name="direction" value={dir} />
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
          {(
            [
              ["in", "Внесение"],
              ["out", "Изъятие"],
            ] as const
          ).map(([d, l]) => (
            <button
              key={d}
              type="button"
              onClick={() => setDir(d)}
              className={cn(
                "rounded-lg py-2 text-sm font-semibold transition",
                dir === d ? (d === "in" ? "bg-white text-emerald-700 shadow-sm" : "bg-white text-red-600 shadow-sm") : "text-slate-500",
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_96px] gap-2">
          <Input name="amount" inputMode="decimal" placeholder="Сумма" required />
          <Select name="currency">
            <option>TJS</option>
            <option>CNY</option>
          </Select>
        </div>
        <Input name="note" placeholder="Комментарий (обязательно)" required />
        <FormMessage state={state} />
        <SubmitButton className="w-full">Провести</SubmitButton>
      </form>
    </Card>
  );
}
