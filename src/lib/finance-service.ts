import type { FinancialKpis, MonthPoint, Transaction } from "./finance-types";
import { calendarWeekday, parseCalendarDate } from "./calendar-date";

const monthLabels = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

function validTransactions(rows: Transaction[]) {
  return rows.filter((row) => Number.isFinite(row.amount) && parseCalendarDate(row.date) !== null);
}

export function monthlySeriesFromTransactions(rows: Transaction[]): MonthPoint[] {
  const grouped = new Map<string, { receita: number; despesa: number }>();

  for (const row of validTransactions(rows)) {
    const key = row.date.slice(0, 7);
    const current = grouped.get(key) ?? { receita: 0, despesa: 0 };
    current[row.type] += Math.abs(row.amount);
    grouped.set(key, current);
  }

  const allMonths = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  const visibleMonths = allMonths.slice(-12);
  let saldo = allMonths
    .slice(0, -visibleMonths.length)
    .reduce((sum, [, totals]) => sum + totals.receita - totals.despesa, 0);
  return visibleMonths.map(([key, totals]) => {
    const month = Number(key.split("-")[1]);
    const lucro = totals.receita - totals.despesa;
    saldo += lucro;
    return {
      month: monthLabels[month - 1]!,
      receita: totals.receita,
      despesa: totals.despesa,
      lucro,
      saldo,
    };
  });
}

export function parseCurrencyInput(value: string) {
  let normalized = value.replace(/[^\d,.-]/g, "");
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) normalized = normalized.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
}

function percentage(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function kpisFromTransactions(rows: Transaction[]): FinancialKpis {
  const series = monthlySeriesFromTransactions(rows);
  const current = series.at(-1) ?? { receita: 0, despesa: 0, lucro: 0, saldo: 0 };
  const previous = series.at(-2) ?? { receita: 0, despesa: 0, lucro: 0, saldo: 0 };
  return {
    receita: { value: current.receita, delta: percentage(current.receita, previous.receita) },
    despesa: { value: current.despesa, delta: percentage(current.despesa, previous.despesa) },
    lucro: { value: current.lucro, delta: percentage(current.lucro, previous.lucro) },
    saldo: { value: current.saldo, delta: percentage(current.saldo, previous.saldo) },
  };
}

export function expenseCategoriesFromTransactions(rows: Transaction[]) {
  const expenses = rows.filter((row) => row.type === "despesa");
  const total = expenses.reduce((sum, row) => sum + Math.abs(row.amount), 0);
  const grouped = new Map<string, number>();
  for (const row of expenses)
    grouped.set(row.category, (grouped.get(row.category) ?? 0) + Math.abs(row.amount));
  return [...grouped.entries()]
    .map(([name, amount]) => ({ name, value: total ? (amount / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
}

export function weekdayRevenueFromTransactions(rows: Transaction[]) {
  const labels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const totals = labels.map((day) => ({ day, receita: 0 }));
  for (const row of validTransactions(rows)) {
    if (row.type !== "receita") continue;
    const weekday = calendarWeekday(row.date);
    if (weekday === null) continue;
    totals[weekday]!.receita += Math.abs(row.amount);
  }
  return [...totals.slice(1), totals[0]!];
}
