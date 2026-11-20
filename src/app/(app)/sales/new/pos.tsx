"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Search, ShoppingCart, Trash2, UserRound, X } from "lucide-react";
import { createSale } from "../actions";
import { money, qty as fmtQty, PAYMENT_LABEL } from "@/lib/format";
import type { Currency, PaymentMethod } from "@/lib/types";
import { Button, Card, cn, Field, Input, inputClass, Notice, Select } from "@/components/ui";

export type PosProduct = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  stock: number;
  unit: string;
  sale_price: number;
  sale_currency: Currency;
};
type PosCustomer = { id: string; name: string; phone: string | null };
type Line = { product: PosProduct; qty: number; price: number | null };

const round2 = (n: number) => Math.round(n * 100) / 100;

export function Pos({
  products,
  customers,
  cnyRate,
  canPrice,
}: {
  products: PosProduct[];
  customers: PosCustomer[];
  cnyRate: number;
  canPrice: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [currency, setCurrency] = useState<Currency>("TJS");
  const [customerId, setCustomerId] = useState("");
  const [discount, setDiscount] = useState("");
  const [paidInput, setPaidInput] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [pending, startTransition] = useTransition();

  const rate = (c: Currency) => (c === "TJS" ? 1 : cnyRate);
  const catalogPrice = (p: PosProduct) => round2((Number(p.sale_price) * rate(p.sale_currency)) / rate(currency));
  const linePrice = (l: Line) => (l.price ?? catalogPrice(l.product));

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 40);
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.barcode === q)
      .slice(0, 40);
  }, [products, search]);

  const subtotal = round2(lines.reduce((s, l) => s + round2(l.qty * linePrice(l)), 0));
  const disc = Math.min(Number(discount.replace(",", ".")) || 0, subtotal);
  const total = round2(subtotal - disc);
  const paid = paidInput === null ? total : Math.min(Number(paidInput.replace(",", ".")) || 0, total);
  const debt = round2(total - paid);
  const count = lines.reduce((s, l) => s + l.qty, 0);

  function add(p: PosProduct) {
    setError(null);
    setLines((prev) => {
      const ex = prev.find((l) => l.product.id === p.id);
      if (ex) return prev.map((l) => (l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { product: p, qty: 1, price: null }];
    });
  }
  function setQty(id: string, q: number) {
    setLines((prev) => (q <= 0 ? prev.filter((l) => l.product.id !== id) : prev.map((l) => (l.product.id === id ? { ...l, qty: q } : l))));
  }
  function onSearchEnter() {
    const q = search.trim();
    const exact = products.find((p) => p.barcode === q || p.sku?.toLowerCase() === q.toLowerCase());
    if (exact) {
      add(exact);
      setSearch("");
    } else if (results.length === 1) {
      add(results[0]);
      setSearch("");
    }
  }

  function submit() {
    setError(null);
    if (!lines.length) return setError("Добавьте товары в чек");
    if (debt > 0 && !customerId) return setError("Для продажи в долг выберите клиента");
    const over = lines.find((l) => l.qty > Number(l.product.stock));
    if (over) return setError(`Недостаточно «${over.product.name}»: на складе ${fmtQty(over.product.stock)} ${over.product.unit}`);
    startTransition(async () => {
      const res = await createSale({
        items: lines.map((l) => ({ product_id: l.product.id, qty: l.qty, ...(canPrice && l.price !== null ? { price: l.price } : {}) })),
        currency,
        customer_id: customerId || null,
        discount: canPrice ? disc : 0,
        paid,
        payment_method: method,
        note,
      });
      if (res?.error) setError(res.error);
      else if (res?.id) router.push(`/sales/${res.id}?new=1`);
    });
  }

  const checkout = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
        {(["TJS", "CNY"] as Currency[]).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              setCurrency(c);
              setPaidInput(null);
              setLines((prev) => prev.map((l) => ({ ...l, price: null })));
            }}
            className={cn("rounded-lg py-2 text-sm font-semibold transition", currency === c ? "bg-white text-brand-700 shadow-sm" : "text-slate-500")}
          >
            {c === "TJS" ? "Сомони · TJS" : "Юань · CNY"}
          </button>
        ))}
      </div>
      {currency === "CNY" && <p className="-mt-2 text-xs text-muted">Курс: 1 CNY = {cnyRate} TJS</p>}

      <Field label="Клиент">
        <div className="relative">
          <UserRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="pl-9">
            <option value="">Без клиента (розница)</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.phone ? ` · ${c.phone}` : ""}
              </option>
            ))}
          </Select>
        </div>
      </Field>

      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMethod(m)}
            className={cn(
              "rounded-xl border py-2 text-sm font-medium transition",
              method === m ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line bg-white text-slate-600",
            )}
          >
            {PAYMENT_LABEL[m]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {canPrice && (
          <Field label="Скидка">
            <Input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
          </Field>
        )}
        <Field label="Оплачено" className={canPrice ? "" : "col-span-2"}>
          <Input
            inputMode="decimal"
            value={paidInput ?? String(total)}
            onChange={(e) => setPaidInput(e.target.value)}
            onFocus={(e) => e.target.select()}
          />
        </Field>
      </div>
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Комментарий (необязательно)" />

      <div className="space-y-1.5 rounded-xl bg-slate-50 p-3 text-sm">
        <Row label={`Товаров: ${fmtQty(count)}`} value={money(subtotal, currency)} />
        {disc > 0 && <Row label="Скидка" value={`− ${money(disc, currency)}`} />}
        <Row label="Итого" value={money(total, currency)} strong />
        {debt > 0 && <Row label="В долг" value={money(debt, currency)} warn />}
      </div>

      {error && <Notice tone="red">{error}</Notice>}
      <Button onClick={submit} disabled={pending || !lines.length} size="lg" className="w-full">
        {pending && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
        {pending ? "Оформление…" : `Оформить · ${money(total, currency)}`}
      </Button>
    </div>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="min-w-0">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), onSearchEnter())}
            placeholder="Поиск товара или сканируйте штрихкод"
            className={cn(inputClass, "h-12 rounded-2xl pl-10")}
            enterKeyHint="search"
            autoComplete="off"
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
          {results.map((p) => {
            const inCart = lines.find((l) => l.product.id === p.id)?.qty ?? 0;
            const out = Number(p.stock) <= 0;
            return (
              <button
                key={p.id}
                type="button"
                disabled={out}
                onClick={() => add(p)}
                className={cn(
                  "relative flex min-h-[104px] flex-col rounded-2xl border bg-white p-3 text-left transition active:scale-[0.97] disabled:opacity-50",
                  inCart ? "border-brand-500 ring-2 ring-brand-100" : "border-line hover:border-brand-200",
                )}
              >
                {inCart > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 grid size-6 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white shadow">
                    {fmtQty(inCart)}
                  </span>
                )}
                <span className="line-clamp-2 text-[14px] leading-snug font-medium">{p.name}</span>
                <span className="mt-auto pt-2">
                  <span className="tabular block text-[15px] font-bold text-brand-700">{money(catalogPrice(p), currency)}</span>
                  <span className={cn("text-xs", out ? "text-red-500" : "text-muted")}>
                    {out ? "Нет в наличии" : `${fmtQty(p.stock)} ${p.unit}`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {results.length === 0 && <p className="py-10 text-center text-sm text-muted">Товары не найдены</p>}
      </div>

      {/* Чек */}
      <div className="lg:sticky lg:top-6 lg:h-fit">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="flex items-center gap-2 font-semibold">
              <ShoppingCart className="size-4 text-brand-600" /> Чек
            </p>
            {lines.length > 0 && (
              <button onClick={() => setLines([])} className="text-sm text-slate-400 hover:text-red-500">
                Очистить
              </button>
            )}
          </div>
          {lines.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">Нажмите на товар, чтобы добавить</p>
          ) : (
            <div className="max-h-[42vh] divide-y divide-line overflow-y-auto">
              {lines.map((l) => (
                <div key={l.product.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[14px] leading-snug font-medium">{l.product.name}</p>
                    <button onClick={() => setQty(l.product.id, 0)} className="text-slate-300 hover:text-red-500" aria-label="Убрать">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex items-center rounded-xl border border-line">
                      <button onClick={() => setQty(l.product.id, l.qty - 1)} className="grid size-9 place-items-center text-slate-500" aria-label="Меньше">
                        <Minus className="size-4" />
                      </button>
                      <input
                        inputMode="decimal"
                        value={l.qty}
                        onChange={(e) => setQty(l.product.id, Number(e.target.value.replace(",", ".")) || 0)}
                        className="tabular w-12 bg-transparent text-center font-semibold outline-none"
                      />
                      <button onClick={() => setQty(l.product.id, l.qty + 1)} className="grid size-9 place-items-center text-slate-500" aria-label="Больше">
                        <Plus className="size-4" />
                      </button>
                    </div>
                    {canPrice ? (
                      <input
                        inputMode="decimal"
                        value={l.price ?? catalogPrice(l.product)}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((x) => (x.product.id === l.product.id ? { ...x, price: Number(e.target.value.replace(",", ".")) || 0 } : x)),
                          )
                        }
                        className="tabular w-24 rounded-lg border border-line px-2 py-1.5 text-right text-sm"
                        aria-label="Цена"
                      />
                    ) : (
                      <span className="text-sm text-muted">× {money(linePrice(l), currency)}</span>
                    )}
                    <span className="tabular w-24 text-right font-semibold">{money(round2(l.qty * linePrice(l)), currency)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="hidden border-t border-line p-4 lg:block">{checkout}</div>
        </Card>
      </div>

      {/* Мобильная нижняя панель и шторка оформления */}
      {lines.length > 0 && !sheet && (
        <div className="fixed inset-x-0 bottom-[calc(64px+var(--safe-bottom))] z-30 px-4 lg:hidden">
          <Button onClick={() => setSheet(true)} size="lg" className="w-full animate-fade-up shadow-xl">
            <ShoppingCart className="size-5" /> Оформить · {money(total, currency)}
          </Button>
        </div>
      )}
      {sheet && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={() => setSheet(false)} />
          <div className="pb-safe absolute inset-x-0 bottom-0 max-h-[92dvh] animate-sheet overflow-y-auto rounded-t-3xl bg-white px-4 pt-3">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200" />
            <div className="mb-3 flex items-center justify-between">
              <p className="text-lg font-bold">Оформление продажи</p>
              <button onClick={() => setSheet(false)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100" aria-label="Закрыть">
                <X className="size-5" />
              </button>
            </div>
            <div className="pb-4">{checkout}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, strong, warn }: { label: string; value: string; strong?: boolean; warn?: boolean }) {
  return (
    <div className={cn("flex justify-between", strong && "border-t border-line pt-1.5 text-base font-bold", warn && "font-semibold text-amber-600")}>
      <span className={strong || warn ? "" : "text-muted"}>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
