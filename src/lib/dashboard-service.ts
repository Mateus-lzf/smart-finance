import { parseCalendarDate } from "./calendar-date";
import type { Transaction } from "./finance-types";
import type {
  DashboardAnalysis,
  DashboardCategory,
  DashboardComparison,
  DashboardMonth,
  DashboardPeriod,
} from "./dashboard-types";

const monthNames = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const shortMonthNames = [
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

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function periodFromLatestDate(date: string): DashboardPeriod {
  const [year, month, cutoff] = date.split("-").map(Number) as [number, number, number];
  const isFullMonth = cutoff === daysInMonth(year, month);
  const monthLabel = `${monthNames[month - 1]} de ${year}`;
  return {
    year,
    month,
    cutoff,
    startDate: isoDate(year, month, 1),
    endDate: isoDate(year, month, cutoff),
    label: isFullMonth
      ? monthLabel[0]!.toUpperCase() + monthLabel.slice(1)
      : `1 a ${cutoff} de ${monthLabel}`,
    contextLabel: isFullMonth
      ? `Dados registrados em ${monthLabel}`
      : `Dados registrados de 1 a ${cutoff} de ${monthLabel}`,
    isFullMonth,
  };
}

function previousPeriod(period: DashboardPeriod) {
  const cursor = new Date(Date.UTC(period.year, period.month - 2, 1));
  const year = cursor.getUTCFullYear();
  const month = cursor.getUTCMonth() + 1;
  const cutoff = Math.min(period.cutoff, daysInMonth(year, month));
  const monthLabel = `${monthNames[month - 1]} de ${year}`;
  return {
    year,
    month,
    cutoff,
    startDate: isoDate(year, month, 1),
    endDate: isoDate(year, month, cutoff),
    label: cutoff === daysInMonth(year, month) ? monthLabel : `1 a ${cutoff} de ${monthLabel}`,
  };
}

const amount = (row: Transaction) => Math.abs(row.amount);
const total = (rows: Transaction[], type: Transaction["type"]) =>
  rows.filter((row) => row.type === type).reduce((sum, row) => sum + amount(row), 0);

function percentageComparison(
  current: number,
  previous: number,
  hasPreviousRows: boolean,
  previousPeriodLabel: string,
): DashboardComparison {
  if (!hasPreviousRows) return { state: "no-comparable-period" };
  if (previous === 0) return { state: "zero-base", current, previousPeriodLabel };
  return {
    state: "comparable",
    current,
    previous,
    difference: current - previous,
    percentage: ((current - previous) / previous) * 100,
    previousPeriodLabel,
  };
}

function resultComparison(
  current: number,
  previous: number,
  hasPreviousRows: boolean,
  previousPeriodLabel: string,
): DashboardComparison {
  if (!hasPreviousRows) return { state: "no-comparable-period" };
  const signChange =
    previous >= 0 && current < 0
      ? "positive-to-negative"
      : previous < 0 && current >= 0
        ? "negative-to-positive"
        : "none";
  return {
    state: "absolute",
    current,
    previous,
    difference: current - previous,
    previousPeriodLabel,
    signChange,
  };
}

function monthlySeries(rows: Transaction[], period: DashboardPeriod): DashboardMonth[] {
  const grouped = new Map<string, Transaction[]>();
  rows.forEach((row) => {
    const key = row.date.slice(0, 7);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  });
  const firstMonth = [...grouped.keys()].sort()[0]!;
  const lowerBoundDate = new Date(Date.UTC(period.year, period.month - 12, 1));
  const lowerBound = `${lowerBoundDate.getUTCFullYear()}-${String(lowerBoundDate.getUTCMonth() + 1).padStart(2, "0")}`;
  const start = firstMonth > lowerBound ? firstMonth : lowerBound;
  const [startYear, startMonth] = start.split("-").map(Number);
  const cursor = new Date(Date.UTC(startYear!, startMonth! - 1, 1));
  const end = new Date(Date.UTC(period.year, period.month - 1, 1));
  const months: DashboardMonth[] = [];
  while (cursor <= end) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const monthRows = grouped.get(key);
    if (!monthRows?.length) {
      months.push({
        key,
        label: `${shortMonthNames[month - 1]}/${year}`,
        revenue: null,
        expenses: null,
        result: null,
        hasActivity: false,
      });
    } else {
      const revenue = total(monthRows, "receita");
      const expenses = total(monthRows, "despesa");
      months.push({
        key,
        label: `${shortMonthNames[month - 1]}/${year}`,
        revenue,
        expenses,
        result: revenue - expenses,
        hasActivity: true,
      });
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

function largestTransaction(rows: Transaction[], type: Transaction["type"]) {
  return (
    rows
      .filter((row) => row.type === type)
      .sort(
        (a, b) =>
          amount(b) - amount(a) ||
          b.date.localeCompare(a.date) ||
          a.description.localeCompare(b.description, "pt-BR") ||
          a.id.localeCompare(b.id),
      )[0] ?? null
  );
}

function expenseCategories(rows: Transaction[]): DashboardCategory[] {
  const expenses = rows.filter((row) => row.type === "despesa");
  const expenseTotal = total(expenses, "despesa");
  const grouped = new Map<string, { name: string; amount: number }>();
  expenses.forEach((row) => {
    const name = row.category.trim() || "Sem categoria";
    const key = name.toLocaleLowerCase("pt-BR");
    const current = grouped.get(key) ?? { name, amount: 0 };
    current.amount += amount(row);
    grouped.set(key, current);
  });
  return [...grouped.values()]
    .map((item) => ({ ...item, share: expenseTotal ? (item.amount / expenseTotal) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, 6);
}

export function buildDashboardAnalysis(rows: Transaction[]): DashboardAnalysis {
  const valid: Transaction[] = [];
  let invalidDateCount = 0;
  rows.forEach((row) => {
    const date = parseCalendarDate(row.date);
    if (!date) invalidDateCount += 1;
    else if (Number.isFinite(row.amount)) valid.push({ ...row, date });
  });
  valid.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const latest = valid.at(-1);
  if (!latest)
    return {
      state: "no-transactions",
      period: null,
      previousPeriodLabel: null,
      transactionCount: 0,
      invalidDateCount,
      kpis: {
        revenue: { value: 0 },
        expenses: { value: 0 },
        result: { value: 0 },
        margin: { value: null },
      },
      months: [],
      expenseCategories: [],
      periodSummary: {
        largestRevenue: null,
        largestExpense: null,
        revenueCount: 0,
        expenseCount: 0,
      },
      recentTransactions: [],
    };

  const period = periodFromLatestDate(latest.date);
  const previous = previousPeriod(period);
  const currentRows = valid.filter(
    (row) => row.date >= period.startDate && row.date <= period.endDate,
  );
  const previousRows = valid.filter(
    (row) => row.date >= previous.startDate && row.date <= previous.endDate,
  );
  const revenue = total(currentRows, "receita");
  const expenses = total(currentRows, "despesa");
  const result = revenue - expenses;
  const previousRevenue = total(previousRows, "receita");
  const previousExpenses = total(previousRows, "despesa");
  const previousResult = previousRevenue - previousExpenses;
  return {
    state: "available",
    period,
    previousPeriodLabel: previous.label,
    transactionCount: currentRows.length,
    invalidDateCount,
    kpis: {
      revenue: {
        value: revenue,
        comparison: percentageComparison(
          revenue,
          previousRevenue,
          previousRows.length > 0,
          previous.label,
        ),
      },
      expenses: {
        value: expenses,
        comparison: percentageComparison(
          expenses,
          previousExpenses,
          previousRows.length > 0,
          previous.label,
        ),
      },
      result: {
        value: result,
        comparison: resultComparison(
          result,
          previousResult,
          previousRows.length > 0,
          previous.label,
        ),
      },
      margin: { value: revenue ? (result / revenue) * 100 : null },
    },
    months: monthlySeries(valid, period),
    expenseCategories: expenseCategories(currentRows),
    periodSummary: {
      largestRevenue: largestTransaction(currentRows, "receita"),
      largestExpense: largestTransaction(currentRows, "despesa"),
      revenueCount: currentRows.filter((row) => row.type === "receita").length,
      expenseCount: currentRows.filter((row) => row.type === "despesa").length,
    },
    recentTransactions: [...currentRows]
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          a.description.localeCompare(b.description, "pt-BR") ||
          a.id.localeCompare(b.id),
      )
      .slice(0, 6),
  };
}
