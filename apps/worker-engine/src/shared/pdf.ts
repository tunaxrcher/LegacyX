/**
 * Tiny zero-dependency PDF generator.
 *
 * Generates a single-page A4 PDF with multi-line text using PDF's built-in
 * Helvetica font (no font embedding → ASCII only). Sufficient for an
 * E_RECEIPT / MEDICAL_CERT stub. Replace with `pdfkit` or `@react-pdf/renderer`
 * when proper Thai text + layout is required (Phase 9 polish).
 */

function escape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function asciiSafe(s: string): string {
  // Replace non-ASCII (e.g. Thai) with `?` since we don't embed CID fonts.
  return s.replace(/[^\x20-\x7E]/g, "?");
}

export function buildSimplePdf(opts: {
  title: string;
  lines: string[];
}): Buffer {
  const FONT_SIZE = 11;
  const LINE_HEIGHT = 16;
  const MARGIN_X = 50;
  const PAGE_HEIGHT = 842;
  const PAGE_WIDTH = 595;

  const lines = [opts.title, "".padEnd(Math.min(opts.title.length, 80), "="), "", ...opts.lines];
  const safeLines = lines.map(asciiSafe);

  // Build text content stream
  let ty = PAGE_HEIGHT - 60;
  let stream = `BT\n/F1 ${FONT_SIZE} Tf\n${LINE_HEIGHT} TL\n${MARGIN_X} ${ty} Td\n`;
  for (let i = 0; i < safeLines.length; i++) {
    const line = safeLines[i] ?? "";
    stream += `(${escape(line)}) Tj\nT*\n`;
  }
  stream += "ET";
  const streamBytes = Buffer.from(stream, "binary");

  // Object table
  const objects: string[] = [];
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  objects.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  objects.push(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n`,
  );
  objects.push(
    `4 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
  );
  objects.push("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");

  const header = "%PDF-1.4\n%\xff\xff\xff\xff\n";
  let buf = Buffer.from(header, "binary");
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(buf.length);
    buf = Buffer.concat([buf, Buffer.from(obj, "binary")]);
  }
  const xrefOffset = buf.length;
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += "0000000000 65535 f \n";
  for (const off of offsets) {
    xref += `${off.toString().padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  buf = Buffer.concat([buf, Buffer.from(xref + trailer, "binary")]);
  return buf;
}
