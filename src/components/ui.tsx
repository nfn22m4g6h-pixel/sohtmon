import Link from "next/link";
import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";

export function cn(...args: Parameters<typeof clsx>) {
  return clsx(...args);
}

export function PageHeader({
  title,
  subtitle,
  action,
  back,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  back?: string;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3 animate-fade-up">
      <div className="min-w-0">
        {back && (
          <Link href={back} className="mb-1 inline-flex items-center gap-1 text-sm font-medium text-brand-600">
            ← Назад
          </Link>
        )}
        <h1 className="truncate text-2xl font-bold tracking-tight text-ink md:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function Card({ className, children, ...rest }: ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, action, subtitle }: { title: string; action?: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const buttonStyles = {
  primary:
    "bg-brand-600 text-white shadow-[0_6px_16px_-6px_rgba(37,87,235,0.6)] hover:bg-brand-700 active:bg-brand-800",
  secondary: "bg-brand-50 text-brand-700 hover:bg-brand-100",
  outline: "border border-line bg-white text-ink hover:bg-slate-50",
  danger: "bg-red-50 text-red-600 hover:bg-red-100",
  ghost: "text-brand-700 hover:bg-brand-50",
};

export type ButtonVariant = keyof typeof buttonStyles;

export function buttonClass(variant: ButtonVariant = "primary", size: "sm" | "md" | "lg" = "md") {
  return cn(
    "inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
    size === "sm" && "h-9 px-3 text-sm",
    size === "md" && "h-11 px-4 text-[15px]",
    size === "lg" && "h-13 px-5 text-base",
    buttonStyles[variant],
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: "sm" | "md" | "lg" }) {
  return <button className={cn(buttonClass(variant, size), className)} {...rest} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: "sm" | "md" | "lg" }) {
  return <Link className={cn(buttonClass(variant, size), className)} {...rest} />;
}

export const inputClass =
  "block w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-ink placeholder:text-slate-400 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100 disabled:bg-slate-50";

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

export function Select(props: ComponentProps<"select">) {
  return (
    <select
      {...props}
      className={cn(inputClass, "appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9", props.className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        ...props.style,
      }}
    />
  );
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea rows={3} {...props} className={cn(inputClass, "resize-none", props.className)} />;
}

const badgeTones = {
  blue: "bg-brand-50 text-brand-700",
  green: "bg-emerald-50 text-emerald-700",
  red: "bg-red-50 text-red-600",
  amber: "bg-amber-50 text-amber-700",
  gray: "bg-slate-100 text-slate-600",
};

export function Badge({ tone = "gray", children, className }: { tone?: keyof typeof badgeTones; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", badgeTones[tone], className)}>
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "blue",
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "blue" | "green" | "amber" | "red" | "dark";
  href?: string;
}) {
  const tones = {
    blue: "bg-brand-50 text-brand-600",
    green: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    dark: "bg-white/15 text-white",
  };
  const inner = (
    <Card
      className={cn(
        "h-full p-4 transition",
        href && "hover:border-brand-200 hover:shadow-md",
        tone === "dark" && "border-0 bg-gradient-to-br from-brand-600 to-brand-800 text-white",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={cn("text-[13px] font-medium", tone === "dark" ? "text-brand-100" : "text-muted")}>{label}</p>
        {icon && <span className={cn("grid size-9 place-items-center rounded-xl", tones[tone])}>{icon}</span>}
      </div>
      <p className="tabular mt-2 text-[22px] leading-tight font-bold tracking-tight">{value}</p>
      {hint && <div className={cn("mt-1 text-xs", tone === "dark" ? "text-brand-100" : "text-muted")}>{hint}</div>}
    </Card>
  );
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-3 grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-500">{icon}</div>}
      <p className="font-semibold text-ink">{title}</p>
      {text && <p className="mt-1 max-w-xs text-sm text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ListRow({
  href,
  title,
  subtitle,
  right,
  rightSub,
  leading,
}: {
  href?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  rightSub?: ReactNode;
  leading?: ReactNode;
}) {
  const body = (
    <div className="flex items-center gap-3 px-4 py-3">
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium text-ink">{title}</div>
        {subtitle && <div className="truncate text-[13px] text-muted">{subtitle}</div>}
      </div>
      {(right || rightSub) && (
        <div className="shrink-0 text-right">
          {right && <div className="tabular text-[15px] font-semibold text-ink">{right}</div>}
          {rightSub && <div className="text-xs text-muted">{rightSub}</div>}
        </div>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block transition hover:bg-slate-50 active:bg-slate-100">
      {body}
    </Link>
  ) : (
    body
  );
}

export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("divide-y divide-line", className)}>{children}</div>;
}

export function Chips({
  items,
  active,
}: {
  items: { href: string; label: string; key: string }[];
  active: string;
}) {
  return (
    <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          className={cn(
            "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
            active === i.key
              ? "border-brand-600 bg-brand-600 text-white shadow-sm"
              : "border-line bg-white text-slate-600 hover:border-brand-200",
          )}
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}

export function Notice({ tone = "blue", children }: { tone?: "blue" | "amber" | "red" | "green"; children: ReactNode }) {
  const tones = {
    blue: "border-brand-100 bg-brand-50 text-brand-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };
  return <div className={cn("rounded-xl border px-3.5 py-2.5 text-sm", tones[tone])}>{children}</div>;
}
