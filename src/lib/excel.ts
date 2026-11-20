import "server-only";
import ExcelJS from "exceljs";

export type Column = { header: string; key: string; width?: number; type?: "money" | "qty" | "date" | "text" | "int" };
export type Sheet = { name: string; title?: string; columns: Column[]; rows: Record<string, unknown>[]; totals?: Record<string, number | string> };

const FMT: Record<string, string> = { money: "#,##0.00", qty: "#,##0.###", int: "0", date: "dd.mm.yyyy hh:mm" };

/** Строит .xlsx с оформлением: заголовок, синяя шапка, итоги, закреплённая шапка. */
export async function buildWorkbook(sheets: Sheet[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SOHTMON ERP";
  wb.created = new Date();

  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31));
    let headerRow = 1;
    if (s.title) {
      ws.addRow([s.title]).font = { bold: true, size: 14, color: { argb: "FF1E38AF" } };
      ws.mergeCells(1, 1, 1, Math.max(s.columns.length, 1));
      ws.addRow([]);
      headerRow = 3;
    }
    const header = ws.addRow(s.columns.map((c) => c.header));
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2557EB" } };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
    header.height = 22;
    s.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = c.width ?? (c.type === "money" ? 14 : c.type === "date" ? 17 : 18);
      if (c.type && FMT[c.type]) col.numFmt = FMT[c.type];
    });
    for (const r of s.rows) {
      ws.addRow(
        s.columns.map((c) => {
          const v = r[c.key];
          if (v === null || v === undefined) return "";
          if (c.type === "date") return new Date(String(v));
          if (c.type === "money" || c.type === "qty" || c.type === "int") return Number(v);
          return String(v);
        }),
      );
    }
    if (s.totals) {
      const row = ws.addRow(s.columns.map((c, i) => (i === 0 ? "Итого" : (s.totals![c.key] ?? ""))));
      row.font = { bold: true };
      row.eachCell((cell) => (cell.border = { top: { style: "thin", color: { argb: "FF94A3B8" } } }));
    }
    ws.views = [{ state: "frozen", ySplit: headerRow }];
    if (s.rows.length) ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: s.columns.length } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
