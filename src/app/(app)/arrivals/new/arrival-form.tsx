"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createArrival } from "../actions";
import { money, PAYMENT_LABEL } from "@/lib/format";
import type { Currency, PaymentMethod } from "@/lib/types";
import { Button, Card, cn, Field, Input, Notice, Select } from "@/components/ui";

type P = { id: string; name: string; sku: string | null; unit: string; purchase_price: number; purchase_currency: Currency };
type S = { id: string; name: string };
type Row = { key: number; product_id: string; qty: string; cost: string };
type Extra = { key: number; name: string; amount: string; currency: Currency; cash: boolean };

const n = (v: string) => Number(v.replace(",", ".").replace(/\s/g, "")) || 0;

export function ArrivalForm({
  products,
  suppliers,
  cnyRate,
  initialProduct,
  initialSupplier,
}: {
  products: P[];
  suppliers: S[];
  cnyRate: number;
  initialProduct?: string;
  initialSupplier?: string;
}) {
  const router = useRouter();
  const [currency, setCurrency] = useState<Currency>("CNY");
  const [supplierId, setSupplierId] = useState(initialSupplier ?? "");
  const [note, setNote] = useState("");
  const [paidInput, setPaidInput] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("transfer");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const priceFor = (id: string, cur: Currency) => {
    const p = products.find((x) => x.id === id);
    return p && p.purchase_currency === cur && Number(p.purchase_price) > 0 ? String(p.purchase_price) : "";
  };
  const [rows, setRows] = useState<Row[]>([{ key: 1, product_id: initialProduct ?? "", qty: "", cost: initialProduct ? priceFor(initialProduct, "CNY") : "" }]);
  const [extras, setExtras] = useState<Extra[]>([]);

  const rate = (c: Currency) => (c === "TJS" ? 1 : cnyRate);
  const total = Math.round(rows.reduce((s, r) => s + n(r.qty) * n(r.cost), 0) * 100) / 100;
  const extraTjs = extras.reduce((s, e) => s + n(e.amount) * rate(e.currency), 0);
  const valueTjs = total * rate(currency);
  const paid = paidInput === null ? (supplierId ? 0 : total) : Math.min(n(paidInput), total);
  const debt = Math.round((total - paid) * 100) / 100;
  const update = (key: number, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const updateExtra = (key: number, patch: Partial<Extra>) => setExtras((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)));

  // Себестоимость строки с долей доп. расходов (как в базе — для предпросмотра)
  const landed = (r: Row) => {
    const q = n(r.qty);
    if (q <= 0) return 0;
    const rowValue = q * n(r.cost) * rate(currency);
    const qtyTotal = rows.reduce((s, x) => s + n(x.qty), 0);
    const share = extraTjs === 0 ? 0 : valueTjs > 0 ? (extraTjs * rowValue) / valueTjs : (extraTjs * q) / qtyTotal;
    return n(r.cost) * rate(currency) + share / q;
  };

  function submit() {
    setError(null);
    const items = rows.filter((r) => r.product_id);
    if (!items.length) return setError("Выберите хотя бы один товар");
    if (items.some((r) => n(r.qty) <= 0)) return setError("Укажите количество для каждого товара");
    if (debt > 0 && !supplierId) return setError("Чтобы оставить долг, выберите поставщика");
    start(async () => {
      const res = await createArrival({
        items: items.map((r) => ({ product_id: r.product_id, qty: n(r.qty), cost: n(r.cost) })),
        currency,
        supplier_id: supplierId || null,
        paid,
        paid_method: method,
        extra_costs: extras.map((e) => ({ name: e.name.trim() || "Доп. расход", amount: n(e.amount), currency: e.currency, paid_from_cash: e.cash })),
        note,
      });
      if (res?.error) setError(res.error);
      else if (res?.id) router.push(`/arrivals/${res.id}`);
    });
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-4">
        <Field label="Поставщик" hint={<Link href="/suppliers" className="text-brand-600">Добавить поставщика</Link>}>
          <Select value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setPaidInput(null); }}>
            <option value="">Без поставщика (оплачено полностью)</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
          {(["CNY", "TJS"] as Currency[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { setCurrency(c); setPaidInput(null); }}
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
              <Select value={r.product_id} onChange={(e) => update(r.key, { product_id: e.target.value, cost: r.cost || priceFor(e.target.value, currency) })}>
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
            {extraTjs > 0 && n(r.qty) > 0 && (
              <p className="pl-8 text-xs text-muted">
                Себестоимость с доставкой: <b className="text-ink">{money(landed(r).toFixed(2))}</b> за ед.
              </p>
            )}
          </div>
        ))}
        <div className="p-3">
          <Button variant="ghost" className="w-full" onClick={() => setRows((prev) => [...prev, { key: Date.now(), product_id: "", qty: "", cost: "" }])}>
            <Plus className="size-4" /> Добавить товар
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <p className="text-[15px] font-semibold">Доставка, таможня и другие расходы</p>
        <p className="mb-3 text-xs text-muted">Распределяются по товарам пропорционально стоимости и входят в себестоимость (не в «Расходы»).</p>
        <div className="space-y-3">
          {extras.map((e) => (
            <div key={e.key} className="space-y-2 rounded-xl bg-slate-50 p-3">
              <div className="flex gap-2">
                <Input value={e.name} onChange={(ev) => updateExtra(e.key, { name: ev.target.value })} placeholder="Доставка / Таможня" list="extra-names" />
                <button onClick={() => setExtras((prev) => prev.filter((x) => x.key !== e.key))} className="p-2 text-slate-300 hover:text-red-500" aria-label="Удалить">
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="grid grid-cols-[1fr_96px] gap-2">
                <Input inputMode="decimal" value={e.amount} onChange={(ev) => updateExtra(e.key, { amount: ev.target.value })} placeholder="Сумма" />
                <Select value={e.currency} onChange={(ev) => updateExtra(e.key, { currency: ev.target.value as Currency })}>
                  <option>TJS</option>
                  <option>CNY</option>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={e.cash} onChange={(ev) => updateExtra(e.key, { cash: ev.target.checked })} className="size-5 accent-brand-600" />
                Оплачено из кассы
              </label>
            </div>
          ))}
          <datalist id="extra-names">
            <option value="Доставка" />
            <option value="Таможня" />
            <option value="Погрузка / разгрузка" />
            <option value="Комиссия банка" />
          </datalist>
          <Button variant="ghost" className="w-full" onClick={() => setExtras((prev) => [...prev, { key: Date.now(), name: "", amount: "", currency: "TJS", cash: false }])}>
            <Plus className="size-4" /> Добавить расход
          </Button>
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <p className="text-[15px] font-semibold">Оплата поставщику</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Оплачено сейчас, ${currency}`}>
            <Input inputMode="decimal" value={paidInput ?? String(paid)} onChange={(e) => setPaidInput(e.target.value)} onFocus={(e) => e.target.select()} />
          </Field>
          <Field label="Способ">
            <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>
                  {m === "cash" ? "Наличные (из кассы)" : PAYMENT_LABEL[m]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Комментарий (номер контейнера, накладной…)" />
        <div className="space-y-1.5 rounded-xl bg-slate-50 p-3 text-sm">
          <div className="flex justify-between"><span className="text-muted">Товары</span><span className="tabular font-semibold">{money(total, currency)}</span></div>
          {extraTjs > 0 && <div className="flex justify-between"><span className="text-muted">Доп. расходы</span><span className="tabular">{money(extraTjs.toFixed(2))}</span></div>}
          <div className="flex justify-between"><span className="text-muted">Оплачено</span><span className="tabular">{money(paid, currency)}</span></div>
          {debt > 0 && <div className="flex justify-between font-semibold text-red-600"><span>Долг поставщику</span><span className="tabular">{money(debt, currency)}</span></div>}
        </div>
      </Card>

      {error && <Notice tone="red">{error}</Notice>}
      <Button onClick={submit} disabled={pending} size="lg" className="w-full">
        {pending ? "Сохранение…" : "Провести приход"}
      </Button>
    </div>
  );
}
