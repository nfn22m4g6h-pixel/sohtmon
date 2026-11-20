"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { num, shortDay } from "@/lib/format";

// Палитра проверена на различимость при дальтонизме (dataviz validate_palette)
export const SERIES = { revenue: "#2557eb", profit: "#0d9488" } as const;

type Point = { day: string; revenue: number; profit?: number };

const compact = (v: number) =>
  Math.abs(v) >= 1_000_000 ? `${num(v / 1_000_000)}M` : Math.abs(v) >= 1000 ? `${num(Math.round(v / 100) / 10)}k` : num(v);

function ChartTooltip({ active, payload, label }: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-ink">{typeof label === "string" && label.includes("-") ? shortDay(label) : label}</p>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2 text-slate-600">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}:</span>
          <span className="tabular font-semibold text-ink">{num(Number(p.value))} TJS</span>
        </div>
      ))}
    </div>
  );
}

export function TrendChart({ data, showProfit = false, height = 240 }: { data: Point[]; showProfit?: boolean; height?: number }) {
  return (
    <div>
      {showProfit && (
        <div className="mb-2 flex gap-4 px-1 text-xs text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: SERIES.revenue }} /> Выручка
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: SERIES.profit }} /> Валовая прибыль
          </span>
        </div>
      )}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="g-rev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES.revenue} stopOpacity={0.22} />
                <stop offset="100%" stopColor={SERIES.revenue} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="g-pro" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES.profit} stopOpacity={0.16} />
                <stop offset="100%" stopColor={SERIES.profit} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#eef2f7" />
            <XAxis
              dataKey="day"
              tickFormatter={shortDay}
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              minTickGap={18}
            />
            <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={44} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#cbd5e1", strokeDasharray: "3 3" }} />
            <Area
              type="monotone"
              dataKey="revenue"
              name="Выручка"
              stroke={SERIES.revenue}
              strokeWidth={2}
              fill="url(#g-rev)"
              activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
              animationDuration={700}
            />
            {showProfit && (
              <Area
                type="monotone"
                dataKey="profit"
                name="Валовая прибыль"
                stroke={SERIES.profit}
                strokeWidth={2}
                fill="url(#g-pro)"
                activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
                animationDuration={700}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Сокращает середину названия: «Бетономешалка 120 л» → «Бетоном…120 л» — различимы похожие товары */
function shortLabel(v: string) {
  return v.length > 17 ? `${v.slice(0, 8)}…${v.slice(-8)}` : v;
}

export function HBarChart({ data, color = SERIES.revenue }: { data: { label: string; value: number }[]; color?: string }) {
  const height = Math.max(120, data.length * 38);
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke="#eef2f7" />
          <XAxis type="number" tickFormatter={compact} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="label"
            width={120}
            tick={{ fontSize: 12, fill: "#475569" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={shortLabel}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f1f5f9" }} />
          <Bar dataKey="value" name="Сумма" fill={color} radius={[0, 4, 4, 0]} maxBarSize={22} animationDuration={700} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
