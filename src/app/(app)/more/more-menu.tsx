"use client";

import Link from "next/link";
import { navFor } from "@/components/nav";
import type { Role } from "@/lib/rbac";

export function MoreMenu({ role }: { role: Role }) {
  const items = navFor(role);
  const groups = [...new Set(items.map((i) => i.group))];
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g} className="animate-fade-up">
          <p className="mb-2 px-1 text-xs font-semibold tracking-wider text-slate-400 uppercase">{g}</p>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
            {items
              .filter((i) => i.group === g)
              .map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-white p-2 text-center transition active:scale-95"
                >
                  <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
                    <i.icon className="size-[22px]" />
                  </span>
                  <span className="text-[12px] leading-tight font-medium">{i.label}</span>
                </Link>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
