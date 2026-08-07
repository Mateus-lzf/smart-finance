const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const BR_DATE = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/;

function buildDate(year: number, month: number, day: number) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  )
    return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseCalendarDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return buildDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  if (typeof value === "number" && value > 0) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000);
    return buildDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  const text = String(value ?? "").trim();
  const iso = ISO_DATE.exec(text.slice(0, 10));
  if (iso) return buildDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const br = BR_DATE.exec(text);
  if (!br) return null;
  const year = Number(br[3]) < 100 ? 2000 + Number(br[3]) : Number(br[3]);
  return buildDate(year, Number(br[2]), Number(br[1]));
}

export function formatCalendarDate(value: string) {
  const parsed = parseCalendarDate(value);
  if (!parsed) return value;
  const [year, month, day] = parsed.split("-");
  return `${day}/${month}/${year}`;
}

export function todayCalendarDate(now = new Date()) {
  return buildDate(now.getFullYear(), now.getMonth() + 1, now.getDate())!;
}

export function calendarWeekday(value: string) {
  const parsed = parseCalendarDate(value);
  if (!parsed) return null;
  const [year, month, day] = parsed.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay();
}
