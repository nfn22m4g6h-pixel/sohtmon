"use client";

import { useActionState, useState } from "react";
import { createAdjustment } from "./actions";
import { qty } from "@/lib/format";
import { Card, cn, Field, Input, Select } from "@/components/ui";
import { FormMessage, SubmitButton, useResetOnSuccess } from "@/components/form";

export const REASON_LABEL: Record<string, string> = {
  inventory: "Инвентаризация",
  damage: "Брак / повреждение",
  loss: "Потеря / недостача",
  return: "Возврат от клиента",
  initial: "Начальный остаток",
  other: "Другое",
};

export function AdjustmentForm({
  products,
  initialProduct,
}: {
  products: { id: string; name: string; stock: number; unit: string }[];
  initialProduct?: string;
}) {
  const [state, action] = useActionState(createAdjustment, null);
  const ref = useResetOnSuccess(state);
  const [productId, setProductId] = useState(initialProduct ?? "");
  const [mode, setMode] = useState<"delta" | "actual">("actual");
  const product = products.find((p) => p.id === productId);

  return (
    <Card className="p-4">
      <form ref={ref} action={action} className="space-y-4">
        <input type="hidden" name="mode" value={mode} />
        <Field label="Товар">
          <Select name="product_id" value={productId} onChange={(e) => setProductId(e.target.value)} required>
            <option value="">Выберите товар…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {qty(p.stock)} {p.unit}
              </option>
            ))}
          </Select>
        </Field>
        {product && (
          <p className="-mt-2 text-sm text-muted">
            Учётный остаток: <b className="text-ink">{qty(product.stock)} {product.unit}</b>
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
          {(
            [
              ["actual", "Фактический остаток"],
              ["delta", "Изменение ±"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn("rounded-lg py-2 text-sm font-semibold transition", mode === m ? "bg-white text-brand-700 shadow-sm" : "text-slate-500")}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={mode === "actual" ? "Насчитано" : "Количество (±)"} hint={mode === "delta" ? "Брак и потеря всегда списываются" : undefined}>
            <Input name="value" inputMode="decimal" required placeholder={mode === "actual" ? "0" : "-1"} />
          </Field>
          <Field label="Причина">
            <Select name="reason" defaultValue="inventory">
              {Object.entries(REASON_LABEL)
                .filter(([k]) => k !== "initial")
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </Select>
          </Field>
        </div>
        <Input name="note" placeholder="Комментарий" />
        <FormMessage state={state} />
        <SubmitButton className="w-full">Провести корректировку</SubmitButton>
      </form>
    </Card>
  );
}
