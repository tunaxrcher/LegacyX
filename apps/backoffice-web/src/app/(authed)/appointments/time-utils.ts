// Date helpers for the /appointments page. All dates are computed in the
// server's local timezone (Asia/Bangkok in production) — Next.js renders
// server-side so this is consistent across requests.

export function parseAnchor(input: string | null | undefined): Date {
  if (!input) return startOfDay(new Date());
  // Accept YYYY-MM-DD; fall back to today on parse failure.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!m) return startOfDay(new Date());
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return startOfDay(d);
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** ISO week starts on Monday (day 1). Sunday → 7. */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay() || 7; // Sun=7
  if (day !== 1) x.setDate(x.getDate() - (day - 1));
  return x;
}

export function endOfWeek(d: Date): Date {
  const start = startOfWeek(d);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return endOfDay(end);
}

export function startOfMonth(d: Date): Date {
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function endOfMonth(d: Date): Date {
  return endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** Returns a 6×7 grid covering the month, padded with surrounding weeks. */
export function monthGrid(d: Date): Date[] {
  const start = startOfWeek(startOfMonth(d));
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const x = new Date(start);
    x.setDate(x.getDate() + i);
    days.push(startOfDay(x));
  }
  return days;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

export function fmtDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fmtTime(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export type ViewMode = "day" | "week" | "month" | "list";

export function isView(s: string | null | undefined): s is ViewMode {
  return s === "day" || s === "week" || s === "month" || s === "list";
}
