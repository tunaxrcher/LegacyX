import ExcelJS from "exceljs";

/**
 * Excel export helpers for the manager reports.
 *
 * One workbook per report (single sheet) keeps the routing simple — the
 * caller passes a header label list and the row matrix; we hand back a
 * Node `Buffer` ready to stream to the browser.
 */
export async function buildReportWorkbook(opts: {
  sheetName: string;
  headers: string[];
  rows: Array<Array<string | number | null>>;
  /** Tab metadata block emitted at the top of the sheet. */
  meta?: Record<string, string>;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LegacyX";
  wb.created = new Date();
  const ws = wb.addWorksheet(opts.sheetName, {
    views: [{ state: "frozen", ySplit: opts.meta ? Object.keys(opts.meta).length + 2 : 1 }],
  });

  if (opts.meta) {
    for (const [k, v] of Object.entries(opts.meta)) {
      const r = ws.addRow([k, v]);
      r.getCell(1).font = { bold: true };
    }
    ws.addRow([]); // blank spacer
  }

  const headerRow = ws.addRow(opts.headers);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEFEFEF" },
  };

  for (const r of opts.rows) ws.addRow(r);

  // Auto-fit-ish — set every column to width = max(content, header).
  ws.columns.forEach((col, i) => {
    const max = Math.max(
      String(opts.headers[i] ?? "").length,
      ...opts.rows.map((r) => String(r[i] ?? "").length),
    );
    col.width = Math.min(40, Math.max(10, max + 2));
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
