"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Undo2 } from "lucide-react";
import { returnItems } from "../actions";
import { money, PAYMENT_LABEL, qty as fmtQty } from "@/lib/format";
import type { Currency, PaymentMethod } from "@/lib/types";
import { Button, Card, cn, Input, Notice, Select } from "@/components/ui";

type Line = { id: string; product_name: string; price: number; available: number };

export function ReturnForm({
  saleId,
  lines,
  currency,
  factor,
  debtLeft,
  defaultMethod,
}: {
  saleId: string;
  lines: Line[];
  currency: Currency;
  factor: number; // итог/сумма чека (учёт скидки)
  debtLeft: number;
  defaultMethod: PaymentMethod;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<PaymentMethod>(defaultMethod);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const total = Math.round(lines.reduce((s, l) => s + Math.round((qtys[l.id] ?? 0) * l.price * factor * 100) / 100, 0) * 100) / 100;
  const debtRed = Math.min(Math.max(debtLeft, 0), total);
  const refund = Math.round((total - debtRed) * 100) / 100;
  const set = (id: string, v: number, max: number) => setQtys((p) => ({ ...p, [id]: Math.min(Math.max(v, 0), max) }));

  if (!open)
    return (
      <>
        {done && <Notice tone="green">{done}</Notice>}
        <Button variant="outline" onClick={() => { setOpen(true); setDone(null); }} className="w-full">
          <Undo2 className="size-4" /> Возврат товаров
        </Button>
      </>
    );

  function submit() {
    setError(null);
    start(async () => {
      const res = await returnItems({
        sale_id: saleId,
        items: lines.map((l) => ({ sale_item_id: l.id, qty: qtys[l.id] ?? 0 })),
        refund_method: method,
        reason,
      });
      if (res?.error) setError(res.error);
      else {
        setOpen(false);
        setQtys({});
        setReason("");
        setDone(res?.message ?? "Возврат оформлен");
        router.refresh();
      }
    });
  }

  return (
    <Card className="space-y-3 border-amber-200 p-4">
      <p className="font-semibold">Возврат товаров</p>
      <div className="divide-y divide-line rounded-xl border border-line">
        {lines.map((l) => (
          <div key={l.id} className="flex items-center gap-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{l.product_name}</p>
              <p className="text-xs text-muted">доступно {fmtQty(l.available)} · {money(l.price, currency)}</p>
            </div>
            <div className={cn("flex items-center rounded-lg border border-line", l.available <= 0 && "opacity-40")}>
              <button type="button" disabled={l.available <= 0} onClick={() => set(l.id, (qtys[l.id] ?? 0) - 1, l.available)} className="grid size-8 place-items-center text-slate-500" aria-label="Меньше">
                <Minus className="size-4" />
              </button>
              <span className="tabular w-8 text-center font-semibold">{fmtQty(qtys[l.id] ?? 0)}</span>
              <button type="button" disabled={l.available <= 0} onClick={() => set(l.id, (qtys[l.id] ?? 0) + 1, l.available)} className="grid size-8 place-items-center text-slate-500" aria-label="Больше">
                <Plus className="size-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
            <option key={m} value={m}>
              Вернуть: {PAYMENT_LABEL[m].toLowerCase()}
            </option>
          ))}
        </Select>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Причина *" />
      </div>
      {total > 0 && (
        <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
          <div className="flex justify-between"><span className="text-muted">Сумма возврата</span><span className="tabular font-semibold">{money(total, currency)}</span></div>
          {debtRed > 0 && <div className="flex justify-between"><span className="text-muted">Уменьшит долг клиента</span><span className="tabular">{money(debtRed, currency)}</span></div>}
          <div className="flex justify-between font-semibold"><span>Выдать клиенту</span><span className="tabular">{money(refund, currency)}</span></div>
        </div>
      )}
      {error && <Notice tone="red">{error}</Notice>}
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">
          Назад
        </Button>
        <Button onClick={submit} disabled={pending || total <= 0} className="flex-1">
          {pending ? "Оформление…" : "Оформить возврат"}
        </Button>
      </div>
    </Card>
  );
}
