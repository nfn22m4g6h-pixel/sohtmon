"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createArrival } from "../actions";
import { money } from "@/lib/format";
import type { Currency } from "@/lib/types";
import { Button, Card, cn, Field, Input, Notice, Select } from "@/components/ui";

type P = { id: string; name: string; sku: string | null; unit: string; purchase_price: number; purchase_currency: Currency };
type Row = { key: number; product_id: string; qty: string; cost: string };

export function ArrivalForm({ products, initialProduct }: { products: P[]; initialProduct?: string }) {
  const router = useRouter();
  const [currency, setCurrency] = useState<Currency>("CNY");
  const [supplier, setSupplier] = useState("");
  const [note, setNote] = useState("");
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const priceFor = (id: string, cur: Currency) => {
    const p = products.find((x) => x.id === id);
    return p && p.purchase_currency === cur && Number(p.purchase_price) > 0 ? String(p.purchase_price) : "";
  };
  const [rows, setRows] = useState<Row[]>([{ key: 1, product_id: initialProduct ?? "", qty: "", cost: initialProduct ? priceFor(initialProduct, "CNY") : "" }]);

  const n = (v: string) => Number(v.replace(",", ".")) || 0;
  const total = rows.reduce((s, r) => s + n(r.qty) * n(r.cost), 0);
  const update = (key: number, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function submit() {
    setError(null);
    const items = rows.filter((r) => r.product_id);
    if (!items.length) return setError("Выберите хотя бы один товар");
    if (items.some((r) => n(r.qty) <= 0)) return setError("Укажите количество для каждого товара");
    start(async () => {
      const res = await createArrival({
        items: items.map((r) => ({ product_id: r.product_id, qty: n(r.qty), cost: n(r.cost) })),
        currency,
        supplier,
        paid_from_cash: paid,
        note,
      });
      if (res?.error) setError(res.error);
      else if (res?.id) router.push(`/arrivals/${res.id}`);
    });
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-4">
        <Field label="Поставщик">
          <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Например: завод в Иу" />
        </Field>
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
          {(["CNY", "TJS"] as Currency[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCurrency(c)}
              className={cn("rounded-lg py-2 text-sm font-semibold transition", currency === c ? "bg-white text-brand-700 shadow-sm" : "text-slate-500")}
            >
              Закупка в {c}
            </button>
          ))}
        </div>
      </Card>

      <Card className="divide-y divide-line">
        {rows.map((r, i) => (
          <div key={r.key} className="space-y-2 p-4">
            <div className="flex items-center gap-2">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">{i + 1}</span>
              <Select
                value={r.product_id}
                onChange={(e) => update(r.key, { product_id: e.target.value, cost: r.cost || priceFor(e.target.value, currency) })}
              >
                <option value="">Выберите товар…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.sku ? ` (${p.sku})` : ""}
                  </option>
                ))}
              </Select>
              {rows.length > 1 && (
                <button onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))} className="p-2 text-slate-300 hover:text-red-500" aria-label="Удалить строку">
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 pl-8">
              <Field label="Кол-во">
                <Input inputMode="decimal" value={r.qty} onChange={(e) => update(r.key, { qty: e.target.value })} placeholder="0" />
              </Field>
              <Field label={`Цена, ${currency}`}>
                <Input inputMode="decimal" value={r.cost} onChange={(e) => update(r.key, { cost: e.target.value })} placeholder="0" />
              </Field>
              <p className="tabular pb-3 text-right text-sm font-semibold whitespace-nowrap">{money(n(r.qty) * n(r.cost), currency)}</p>
            </div>
          </div>
        ))}
        <div className="p-3">
          <Button variant="ghost" className="w-full" onClick={() => setRows((prev) => [...prev, { key: Date.now(), product_id: "", qty: "", cost: "" }])}>
            <Plus className="size-4" /> Добавить строку
          </Button>
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Комментарий (номер контейнера, накладной…)" />
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="size-5 accent-brand-600" />
          Оплачено из кассы ({currency})
        </label>
        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
          <span className="text-muted">Итого прихода</span>
          <span className="tabular text-lg font-bold">{money(total, currency)}</span>
        </div>
      </Card>

      {error && <Notice tone="red">{error}</Notice>}
      <Button onClick={submit} disabled={pending} size="lg" className="w-full">
        {pending ? "Сохранение…" : "Провести приход"}
      </Button>
    </div>
  );
}
