import type { ReactNode } from "react";

export function AuthShell({ children, title, subtitle }: { children: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-white px-4 py-10">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[780px] -translate-x-1/2 rounded-full bg-gradient-to-b from-brand-200/70 to-transparent blur-3xl" />
      <div className="relative w-full max-w-sm animate-fade-up">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 text-3xl font-black text-white shadow-xl shadow-brand-600/30">
            S
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>
        {children}
        <p className="mt-8 text-center text-xs text-slate-400">SOHTMON ERP 1.0</p>
      </div>
    </div>
  );
}
