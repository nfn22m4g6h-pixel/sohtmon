import { FileSpreadsheet } from "lucide-react";
import { buttonClass, cn } from "@/components/ui";

/** Кнопка скачивания Excel. href — /api/export/<вид>?... */
export function ExportButton({ href, className }: { href: string; className?: string }) {
  return (
    <a href={href} download className={cn(buttonClass("outline", "md"), "px-3", className)} title="Скачать Excel">
      <FileSpreadsheet className="size-4 text-emerald-600" />
      <span className="hidden sm:inline">Excel</span>
    </a>
  );
}
