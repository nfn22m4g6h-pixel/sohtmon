"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Ellipsis,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Package,
  Receipt,
  ReceiptText,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  Tags,
  Truck,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { can, ROLE_LABELS, type Permission, type Role } from "@/lib/rbac";
import { cn } from "@/components/ui";
import { signOut } from "@/app/actions";
import { LogoMark } from "@/components/logo";

export type NavItem = { href: string; label: string; short?: string; icon: LucideIcon; perm: Permission; group: string };

export const NAV: NavItem[] = [
  { href: "/", label: "Главная", icon: LayoutDashboard, perm: "dashboard.view", group: "Обзор" },
  { href: "/sales/new", label: "Новая продажа", short: "Продажа", icon: ShoppingCart, perm: "sales.create", group: "Продажи" },
  { href: "/sales", label: "История продаж", short: "Чеки", icon: Receipt, perm: "sales.view", group: "Продажи" },
  { href: "/customers", label: "Клиенты", icon: Users, perm: "customers.view", group: "Продажи" },
  { href: "/debts", label: "Долги и оплаты", short: "Долги", icon: HandCoins, perm: "customers.view", group: "Продажи" },
  { href: "/products", label: "Товары и склад", short: "Товары", icon: Package, perm: "products.view", group: "Склад" },
  { href: "/categories", label: "Категории", icon: Tags, perm: "products.view", group: "Склад" },
  { href: "/arrivals", label: "Приход товара", short: "Приход", icon: Truck, perm: "stock.view", group: "Склад" },
  { href: "/adjustments", label: "Корректировки", short: "Корр.", icon: SlidersHorizontal, perm: "stock.view", group: "Склад" },
  { href: "/cash", label: "Касса", icon: Wallet, perm: "cash.view", group: "Финансы" },
  { href: "/expenses", label: "Расходы", icon: ReceiptText, perm: "expenses.view", group: "Финансы" },
  { href: "/reports", label: "Прибыль и отчёты", short: "Отчёты", icon: BarChart3, perm: "reports.view", group: "Финансы" },
  { href: "/employees", label: "Сотрудники", icon: UserCog, perm: "employees.manage", group: "Управление" },
  { href: "/settings", label: "Настройки", icon: Settings, perm: "dashboard.view", group: "Управление" },
];

const BOTTOM_PRIORITY = ["/", "/sales/new", "/products", "/customers", "/arrivals", "/adjustments", "/cash"];

export function navFor(role: Role) {
  return NAV.filter((i) => can(role, i.perm));
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/sales") return pathname === "/sales" || (pathname.startsWith("/sales/") && pathname !== "/sales/new");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ role, name, company }: { role: Role; name: string; company: string }) {
  const pathname = usePathname();
  const items = navFor(role);
  const groups = [...new Set(items.map((i) => i.group))];
  return (
    <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-white lg:flex">
      <div className="flex items-center gap-3 px-5 py-5">
        <LogoMark size={40} className="shrink-0 drop-shadow-[0_6px_12px_rgba(37,87,235,0.35)]" />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold tracking-tight">{company}</p>
          <p className="text-xs text-muted">ERP 1.0</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((g) => (
          <div key={g} className="mb-3">
            <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{g}</p>
            {items
              .filter((i) => i.group === g)
              .map((i) => {
                const active = isActive(pathname, i.href);
                return (
                  <Link
                    key={i.href}
                    href={i.href}
                    className={cn(
                      "mb-0.5 flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition",
                      active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50 hover:text-ink",
                    )}
                  >
                    <i.icon className={cn("size-[18px]", active ? "text-brand-600" : "text-slate-400")} />
                    {i.label}
                  </Link>
                );
              })}
          </div>
        ))}
      </nav>
      <div className="border-t border-line p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <div className="grid size-9 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
            {name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="text-xs text-muted">{ROLE_LABELS[role]}</p>
          </div>
          <form action={signOut}>
            <button className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-red-500" title="Выйти" aria-label="Выйти">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

export function BottomNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const allowed = navFor(role);
  const main = BOTTOM_PRIORITY.map((h) => allowed.find((i) => i.href === h))
    .filter((i): i is NavItem => Boolean(i))
    .slice(0, 4);
  const moreActive = !main.some((i) => isActive(pathname, i.href));
  return (
    <nav className="no-print pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line/80 bg-white/90 backdrop-blur-xl lg:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5 px-2 pt-1.5">
        {main.map((i) => {
          const active = isActive(pathname, i.href);
          const isSale = i.href === "/sales/new";
          return (
            <Link key={i.href} href={i.href} className="flex flex-col items-center gap-0.5 py-1">
              <span
                className={cn(
                  "grid h-8 w-12 place-items-center rounded-full transition",
                  isSale ? "bg-brand-600 text-white shadow-md shadow-brand-600/40" : active ? "bg-brand-50 text-brand-600" : "text-slate-400",
                )}
              >
                <i.icon className="size-[21px]" strokeWidth={active || isSale ? 2.3 : 1.9} />
              </span>
              <span className={cn("text-[11px] font-medium", active ? "text-brand-700" : "text-slate-500")}>{i.short ?? i.label}</span>
            </Link>
          );
        })}
        <Link href="/more" className="flex flex-col items-center gap-0.5 py-1">
          <span className={cn("grid h-8 w-12 place-items-center rounded-full", moreActive ? "bg-brand-50 text-brand-600" : "text-slate-400")}>
            <Ellipsis className="size-[21px]" />
          </span>
          <span className={cn("text-[11px] font-medium", moreActive ? "text-brand-700" : "text-slate-500")}>Ещё</span>
        </Link>
      </div>
    </nav>
  );
}

export function MobileTopBar({ company, name }: { company: string; name: string }) {
  return (
    <header className="no-print sticky top-0 z-30 border-b border-line/70 bg-white/85 pt-[var(--safe-top)] backdrop-blur-xl lg:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoMark size={32} />
          <span className="text-[16px] font-bold tracking-tight">{company}</span>
        </Link>
        <Link href="/settings" className="grid size-9 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
          {name.slice(0, 1).toUpperCase()}
        </Link>
      </div>
    </header>
  );
}
