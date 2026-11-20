"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn, inputClass } from "@/components/ui";
import { ScanButton } from "@/components/barcode-scanner";

export function SearchInput({ placeholder = "Поиск…", param = "q", scan = false }: { placeholder?: string; param?: string; scan?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get(param) ?? "");
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function update(v: string, immediate = false) {
    setValue(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (v.trim()) next.set(param, v.trim());
      else next.delete(param);
      startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
    }, immediate ? 0 : 300);
  }

  return (
    <div className="relative mb-4">
      <Search className={cn("pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2", pending ? "animate-pulse text-brand-500" : "text-slate-400")} />
      <input
        type="search"
        value={value}
        onChange={(e) => update(e.target.value)}
        placeholder={placeholder}
        className={cn(inputClass, "h-12 rounded-2xl pl-10 shadow-[0_1px_2px_rgba(15,23,42,0.04)]", scan ? "pr-20" : "pr-10")}
        enterKeyHint="search"
      />
      {scan && <ScanButton onResult={(code) => update(code, true)} className="absolute top-1/2 right-1.5 size-10 -translate-y-1/2" />}
      {value && (
        <button type="button" onClick={() => update("")} className={`absolute top-1/2 ${scan ? "right-12" : "right-3"} -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100`} aria-label="Очистить">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

