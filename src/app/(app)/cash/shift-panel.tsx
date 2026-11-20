import Link from "next/link";
import { Clock } from "lucide-react";
import { dateTime, money } from "@/lib/format";
import { Card, List, ListRow } from "@/components/ui";
import { CloseShiftForm, OpenShiftForm } from "./shift-forms";

export type Shift = {
  id: string;
  number: number;
  opened_at: string;
  closed_at: string | null;
  expected_tjs: number | null;
  counted_tjs: number | null;
  expected_cny: number | null;
  counted_cny: number | null;
  opener: { full_name: string } | null;
};

export function ShiftPanel({
  shifts,
  canEdit,
  balanceTjs,
  balanceCny,
}: {
  shifts: Shift[];
  canEdit: boolean;
  balanceTjs: number;
  balanceCny: number;
}) {
  const open = shifts.find((s) => !s.closed_at);
  const closed = shifts.filter((s) => s.closed_at).slice(0, 5);
  return (
    <div className="space-y-4">
      {open ? (
        <Card className="border-emerald-200 p-4">
          <div className="mb-3 flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-emerald-50 text-emerald-600"><Clock className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Смена №{open.number} открыта</p>
              <p className="text-xs text-muted">{dateTime(open.opened_at)}{open.opener?.full_name ? ` · ${open.opener.full_name}` : ""}</p>
            </div>
            <Link href={`/cash/shifts/${open.id}`} className="text-sm font-semibold text-brand-600">Отчёт</Link>
          </div>
          {canEdit && <CloseShiftForm expectedTjs={balanceTjs} expectedCny={balanceCny} />}
        </Card>
      ) : canEdit ? (
        <OpenShiftForm expectedTjs={balanceTjs} expectedCny={balanceCny} />
      ) : (
        <Card className="p-4 text-sm text-muted">Смена не открыта</Card>
      )}
      {closed.length > 0 && (
        <Card className="overflow-hidden">
          <p className="px-4 pt-4 pb-2 text-[15px] font-semibold">Последние смены</p>
          <List>
            {closed.map((s) => {
              const diff = Number(s.counted_tjs ?? 0) - Number(s.expected_tjs ?? 0);
              return (
                <ListRow
                  key={s.id}
                  href={`/cash/shifts/${s.id}`}
                  title={`Смена №${s.number}${s.opener?.full_name ? ` · ${s.opener.full_name}` : ""}`}
                  subtitle={`${dateTime(s.opened_at)} — ${dateTime(s.closed_at!)}`}
                  right={money(s.counted_tjs)}
                  rightSub={diff === 0 ? "сошлось" : <span className={diff < 0 ? "text-red-600" : "text-emerald-600"}>{diff > 0 ? "+" : ""}{money(diff)}</span>}
                />
              );
            })}
          </List>
        </Card>
      )}
    </div>
  );
}
