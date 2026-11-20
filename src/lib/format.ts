import type { Currency, PaymentMethod } from "@/lib/types";

export const TZ = "Asia/Dushanbe";
const TZ_OFFSET = "+05:00"; // Таджикистан: UTC+5 без перехода на летнее время

const numberFmt = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const qtyFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });

export const CURRENCY_LABEL: Record<Currency, string> = { TJS: "сомони", CNY: "юань" };
export const CURRENCY_SIGN: Record<Currency, string> = { TJS: "TJS", CNY: "¥" };

export function money(value: number | string | null | undefined, currency: Currency = "TJS") {
  const n = Number(value ?? 0);
  return currency === "CNY" ? `¥ ${numberFmt.format(n)}` : `${numberFmt.format(n)} TJS`;
}

export function num(value: number | string | null | undefined) {
  return numberFmt.format(Number(value ?? 0));
}

export function qty(value: number | string | null | undefined) {
  return qtyFmt.format(Number(value ?? 0));
}

export function dateTime(value: string | Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function dateOnly(value: string | Date) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(value),
  );
}

/** YYYY-MM-DD в часовом поясе Душанбе */
export function isoDay(value: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

/** Начало дня YYYY-MM-DD (Душанбе) как Date */
export function dayStart(day: string) {
  return new Date(`${day}T00:00:00${TZ_OFFSET}`);
}

export function addDays(day: string, n: number) {
  const d = dayStart(day);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDay(d);
}

export type Period = { from: string; to: string; label: string };

/** Диапазон дат [from, to] включительно → границы для запросов [start, end) */
export function periodRange(from: string, to: string) {
  return { start: dayStart(from).toISOString(), end: dayStart(addDays(to, 1)).toISOString() };
}

export function presetPeriod(preset: string | undefined): Period {
  const today = isoDay();
  switch (preset) {
    case "today":
      return { from: today, to: today, label: "Сегодня" };
    case "7d":
      return { from: addDays(today, -6), to: today, label: "7 дней" };
    case "month": {
      return { from: `${today.slice(0, 8)}01`, to: today, label: "Этот месяц" };
    }
    case "all":
      return { from: "2020-01-01", to: today, label: "Всё время" };
    case "30d":
    default:
      return { from: addDays(today, -29), to: today, label: "30 дней" };
  }
}

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: "Наличные",
  card: "Карта",
  transfer: "Перевод",
};

export function shortDay(day: string) {
  const [, m, d] = day.split("-");
  return `${d}.${m}`;
}
