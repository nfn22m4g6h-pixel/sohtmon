import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateTime, money, PAYMENT_LABEL } from "@/lib/format";
import type { Currency, PaymentMethod } from "@/lib/types";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { PrintButton } from "@/app/(app)/sales/[id]/print-button";

export const metadata: Metadata = { title: "Отчёт смены" };

const SRC: Record<string, string> = {
  sale: "Продажи",
  sale_cancel: "Отмены продаж",
  sale_return: "Возвраты покупателям",
  debt_payment: "Оплаты долгов",
  expense: "Расходы",
  arrival: "Оплата приходов",
  supplier_payment: "Оплаты поставщикам",
  manual: "Ручные операции",
  shift_diff: "Расхождения",
};

type Summary = {
  sales: { currency: Currency; payment_method: PaymentMethod; count: number; total: number; paid: number; debt: number }[];
  returns: { currency: Currency; count: number; total: number; refunded: number }[];
  cash: { currency: Currency; source: string; direction: "in" | "out"; count: number; amount: number }[];
};

export default async function ShiftPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("cash.view");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: shift }, { data: summary }] = await Promise.all([
    supabase.from("cash_shifts").select("*, opener:opened_by(full_name), closer:closed_by(full_name)").eq("id", id).maybeSingle(),
    supabase.rpc("shift_summary", { p_shift_id: id }),
  ]);
  if (!shift) notFound();
  const s = summary as Summary | null;
  const diff = (c: "tjs" | "cny") => (shift.closed_at ? Number(shift[`counted_${c}`]) - Number(shift[`expected_${c}`]) : null);

  return (
    <div className="mx-auto max-w-lg">
      <div className="no-print">
        <PageHeader title={`Смена №${shift.number}`} back="/cash" />
      </div>
      <Card className="mb-4 space-y-2 p-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted">Статус</span>
          {shift.closed_at ? <Badge tone="gray">Закрыта</Badge> : <Badge tone="green">Открыта</Badge>}
        </div>
        <div className="flex justify-between"><span className="text-muted">Открыта</span><span>{dateTime(shift.opened_at)} · {shift.opener?.full_name ?? "—"}</span></div>
        {shift.closed_at && <div className="flex justify-between"><span className="text-muted">Закрыта</span><span>{dateTime(shift.closed_at)} · {shift.closer?.full_name ?? "—"}</span></div>}
        <div className="flex justify-between"><span className="text-muted">На начало</span><span className="tabular">{money(shift.opening_tjs)} · {money(shift.opening_cny, "CNY")}</span></div>
        {shift.closed_at && (
          <>
            <div className="flex justify-between"><span className="text-muted">Ожидалось</span><span className="tabular">{money(shift.expected_tjs)} · {money(shift.expected_cny, "CNY")}</span></div>
            <div className="flex justify-between"><span className="text-muted">Посчитано</span><span className="tabular font-semibold">{money(shift.counted_tjs)} · {money(shift.counted_cny, "CNY")}</span></div>
            {(["tjs", "cny"] as const).map((c) => {
              const d = diff(c)!;
              return (
                <div key={c} className="flex justify-between">
                  <span className="text-muted">Расхождение {c.toUpperCase()}</span>
                  <span className={`tabular font-semibold ${d < 0 ? "text-red-600" : d > 0 ? "text-emerald-600" : ""}`}>
                    {d === 0 ? "нет" : `${d > 0 ? "+" : ""}${money(d, c === "cny" ? "CNY" : "TJS")}`}
                  </span>
                </div>
              );
            })}
          </>
        )}
        {shift.note && <p className="text-muted">Комментарий: {shift.note}</p>}
      </Card>

      <Card className="mb-4">
        <CardHeader title="Продажи за смену" />
        <div className="px-4 pb-4 text-sm">
          {!s?.sales.length ? (
            <p className="text-muted">Продаж нет</p>
          ) : (
            s.sales.map((r) => (
              <div key={`${r.currency}${r.payment_method}`} className="flex justify-between border-b border-line py-1.5 last:border-0">
                <span>{PAYMENT_LABEL[r.payment_method]} · {r.count} шт.</span>
                <span className="tabular font-semibold">{money(r.total, r.currency)}{Number(r.debt) > 0 ? <span className="ml-1 text-xs text-amber-600">(долг {money(r.debt, r.currency)})</span> : null}</span>
              </div>
            ))
          )}
          {s?.returns.map((r) => (
            <div key={r.currency} className="flex justify-between py-1.5 text-amber-700">
              <span>Возвраты · {r.count} шт.</span>
              <span className="tabular">− {money(r.total, r.currency)}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mb-4">
        <CardHeader title="Движение наличных" />
        <div className="px-4 pb-4 text-sm">
          {!s?.cash.length ? (
            <p className="text-muted">Операций нет</p>
          ) : (
            s.cash.map((r) => (
              <div key={`${r.currency}${r.source}${r.direction}`} className="flex justify-between border-b border-line py-1.5 last:border-0">
                <span>{SRC[r.source] ?? r.source} · {r.count}</span>
                <span className={`tabular font-semibold ${r.direction === "in" ? "text-emerald-600" : "text-red-600"}`}>
                  {r.direction === "in" ? "+" : "−"} {money(r.amount, r.currency)}
                </span>
              </div>
            ))
          )}
        </div>
      </Card>
      <div className="no-print">
        <PrintButton />
      </div>
    </div>
  );
}
