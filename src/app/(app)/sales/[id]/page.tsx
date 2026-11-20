import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, MessageCircle } from "lucide-react";
import { waLink } from "@/lib/whatsapp";
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

  // Товары из чека, которые теперь заканчиваются
  const { data: stockRows } = lines.length
    ? await supabase.from("products").select("id, name, stock, min_stock, unit").in("id", lines.map((l) => l.product_id))
    : { data: [] };
  const lowAfter = (stockRows ?? []).filter((p) => Number(p.stock) <= Number(p.min_stock));

  const company = settings?.company_name ?? "SOHTMON";
  const receiptText = [
    `*${company}*`,
    `Чек №${s.number} от ${dateTime(s.created_at)}`,
    "",
    ...lines.map((l) => `${l.product_name}\n  ${qty(l.qty)} × ${money(l.price, s.currency)} = ${money(l.total, s.currency)}`),
    "",
    ...(Number(s.discount) > 0 ? [`Скидка: ${money(s.discount, s.currency)}`] : []),
    `*Итого: ${money(s.total, s.currency)}*`,
    `Оплачено: ${money(s.paid, s.currency)}`,
    ...(Number(s.debt) > 0 ? [`Долг: ${money(s.debt, s.currency)}`] : []),
    ...(cancelled ? ["", "ЧЕК ОТМЕНЁН"] : []),
    "",
    settings?.receipt_footer ?? "",
  ].join("\n");

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
        {!cancelled && lowAfter.length > 0 && (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800 animate-fade-up">
            <p className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="size-5" /> Заканчивается на складе
            </p>
            <ul className="mt-1 space-y-0.5 text-sm">
              {lowAfter.map((p) => (
                <li key={p.id}>
                  {p.name} — осталось {qty(p.stock)} {p.unit} (мин. {qty(p.min_stock)})
                </li>
              ))}
            </ul>
          </div>
        )}
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
        <a
          href={waLink(s.customers?.phone, receiptText)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] text-[15px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(37,211,102,0.7)] transition active:scale-[0.98]"
        >
          <MessageCircle className="size-5" /> {s.customers?.phone ? "Отправить чек клиенту в WhatsApp" : "Отправить чек в WhatsApp"}
        </a>
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
