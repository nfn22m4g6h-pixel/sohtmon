import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { dateTime, money, PAYMENT_LABEL, qty } from "@/lib/format";
import type { Sale, SaleItem } from "@/lib/types";
import { Badge, Card, LinkButton, Notice, PageHeader } from "@/components/ui";
import { CancelSaleForm } from "./cancel-form";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Чек" };

export default async function SalePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const profile = await requirePermission("sales.view");
  const { id } = await params;
  const { new: isNew } = await searchParams;
  const supabase = await createClient();
  const [{ data: sale }, { data: items }, { data: settings }] = await Promise.all([
    supabase.from("sales").select("*, customers(name, phone), profiles:created_by(full_name)").eq("id", id).maybeSingle(),
    supabase.from("sale_items").select("*").eq("sale_id", id),
    supabase.from("settings").select("company_name, receipt_footer").maybeSingle(),
  ]);
  if (!sale) notFound();
  const s = sale as Sale;
  const lines = (items ?? []) as SaleItem[];
  const cancelled = s.status === "cancelled";

  return (
    <div className="mx-auto max-w-md">
      <div className="no-print">
        <PageHeader title={`Чек №${s.number}`} back="/sales" />
        {isNew && !cancelled && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-800 animate-fade-up">
            <CheckCircle2 className="size-6 shrink-0" />
            <div>
              <p className="font-semibold">Продажа оформлена</p>
              <p className="text-sm">Остатки и касса обновлены</p>
            </div>
          </div>
        )}
        {cancelled && <div className="mb-4"><Notice tone="red">Продажа отменена {s.cancelled_at ? dateTime(s.cancelled_at) : ""}</Notice></div>}
      </div>

      <Card className="relative overflow-hidden p-5 font-mono text-[13px] print:border-0 print:shadow-none">
        <div className="text-center">
          <p className="font-sans text-lg font-bold">{settings?.company_name ?? "SOHTMON"}</p>
          <p className="text-muted">Чек №{s.number}</p>
          <p className="text-muted">{dateTime(s.created_at)}</p>
        </div>
        <div className="my-3 border-t border-dashed border-slate-300" />
        {lines.map((l) => (
          <div key={l.id} className="mb-2">
            <p className="font-sans text-[14px] font-medium">{l.product_name}</p>
            <div className="flex justify-between text-slate-600">
              <span>
                {qty(l.qty)} × {money(l.price, s.currency)}
              </span>
              <span className="text-ink">{money(l.total, s.currency)}</span>
            </div>
          </div>
        ))}
        <div className="my-3 border-t border-dashed border-slate-300" />
        <div className="space-y-1">
          {Number(s.discount) > 0 && (
            <>
              <div className="flex justify-between"><span>Сумма</span><span>{money(s.subtotal, s.currency)}</span></div>
              <div className="flex justify-between"><span>Скидка</span><span>− {money(s.discount, s.currency)}</span></div>
            </>
          )}
          <div className="flex justify-between font-sans text-lg font-bold">
            <span>ИТОГО</span>
            <span className={cancelled ? "line-through" : ""}>{money(s.total, s.currency)}</span>
          </div>
          <div className="flex justify-between"><span>Оплачено ({PAYMENT_LABEL[s.payment_method]})</span><span>{money(s.paid, s.currency)}</span></div>
          {Number(s.debt) > 0 && (
            <div className="flex justify-between font-semibold text-amber-700"><span>Долг</span><span>{money(s.debt, s.currency)}</span></div>
          )}
          {s.currency === "CNY" && <p className="text-xs text-muted">Курс: 1 CNY = {Number(s.rate)} TJS</p>}
        </div>
        <div className="my-3 border-t border-dashed border-slate-300" />
        <div className="space-y-0.5 text-slate-600">
          {s.customers && <p>Клиент: {s.customers.name}{s.customers.phone ? `, ${s.customers.phone}` : ""}</p>}
          {s.profiles?.full_name && <p>Продавец: {s.profiles.full_name}</p>}
          {s.note && <p>Примечание: {s.note}</p>}
        </div>
        <p className="mt-4 text-center font-sans text-slate-500">{settings?.receipt_footer}</p>
        {cancelled && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <Badge tone="red" className="-rotate-12 px-4 py-1.5 text-lg">ОТМЕНЕНА</Badge>
          </div>
        )}
      </Card>

      <div className="no-print mt-4 space-y-2">
        <PrintButton />
        {can(profile.role, "sales.create") && (
          <LinkButton href="/sales/new" className="w-full">
            Новая продажа
          </LinkButton>
        )}
        {s.customer_id && can(profile.role, "customers.view") && (
          <LinkButton href={`/customers/${s.customer_id}`} variant="outline" className="w-full">
            Карточка клиента
          </LinkButton>
        )}
        {!cancelled && can(profile.role, "sales.cancel") && <CancelSaleForm id={s.id} />}
      </div>
    </div>
  );
}
