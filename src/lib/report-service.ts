import { formatCalendarDate, parseCalendarDate } from "./calendar-date";
import type { ImportedColumn, ImportedValue, Transaction } from "./finance-types";
import type {
  FinancialReport,
  ReportDimensionValue,
  ReportFilters,
  ReportGroup,
  ReportGrouping,
  ReportMonth,
  ReportOptions,
  ReportSummary,
} from "./report-types";

const monthNames = [
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
export const EMPTY_CATEGORY = "__report_empty_category__";

const amount = (row: Transaction) => Math.abs(row.amount);
const categoryKey = (row: Transaction) => row.category.trim() || EMPTY_CATEGORY;

export function reportDimensionValueKey(value: ImportedValue | undefined) {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim()))
    return "empty:";
  return `${typeof value}:${String(value)}`;
}

export function reportDimensionValueLabel(value: ImportedValue | undefined) {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim()))
    return "Não informado";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "string" && parseCalendarDate(value)) return formatCalendarDate(value);
  return String(value);
}

export function getReportDateBounds(rows: Transaction[]) {
  const dates = rows.flatMap((row) => {
    const parsed = parseCalendarDate(row.date);
    return parsed ? [parsed] : [];
  });
  dates.sort();
  return { startDate: dates[0] ?? "", endDate: dates.at(-1) ?? "" };
}

export function getLatestMonthRange(rows: Transaction[]) {
  const { endDate } = getReportDateBounds(rows);
  if (!endDate) return { startDate: "", endDate: "" };
  const [year, month] = endDate.split("-").map(Number);
  const last = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  return {
    startDate: `${year}-${String(month).padStart(2, "0")}-01`,
    endDate: `${year}-${String(month).padStart(2, "0")}-${last}`,
  };
}

export function getLastTwelveMonthsRange(rows: Transaction[]) {
  const latest = getLatestMonthRange(rows);
  if (!latest.endDate) return latest;
  const [year, month] = latest.endDate.split("-").map(Number);
  const start = new Date(Date.UTC(year!, month! - 12, 1));
  return {
    startDate: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}-01`,
    endDate: latest.endDate,
  };
}

export function getReportCategories(rows: Transaction[]) {
  return [...new Set(rows.map(categoryKey))].sort((a, b) =>
    (a === EMPTY_CATEGORY ? "Sem categoria" : a).localeCompare(
      b === EMPTY_CATEGORY ? "Sem categoria" : b,
      "pt-BR",
    ),
  );
}

export function getReportDimensionValues(rows: Transaction[], columnId: string) {
  const values = new Map<string, ReportDimensionValue>();
  rows.forEach((row) => {
    const value = row.additionalData?.[columnId];
    const key = reportDimensionValueKey(value);
    if (!values.has(key)) values.set(key, { key, value, label: reportDimensionValueLabel(value) });
  });
  return [...values.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

function summarize(rows: Transaction[]): ReportSummary {
  const revenue = rows
    .filter((row) => row.type === "receita")
    .reduce((sum, row) => sum + amount(row), 0);
  const expenses = rows
    .filter((row) => row.type === "despesa")
    .reduce((sum, row) => sum + amount(row), 0);
  const result = revenue - expenses;
  return {
    revenue,
    expenses,
    result,
    margin: revenue ? (result / revenue) * 100 : null,
    transactionCount: rows.length,
    movement: revenue + expenses,
  };
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return `${monthNames[month! - 1]}/${year}`;
}

function monthlySeries(rows: Transaction[]): ReportMonth[] {
  const grouped = new Map<string, Transaction[]>();
  rows.forEach((row) =>
    grouped.set(row.date.slice(0, 7), [...(grouped.get(row.date.slice(0, 7)) ?? []), row]),
  );
  const keys = [...grouped.keys()].sort();
  if (!keys.length) return [];
  const [startYear, startMonth] = keys[0]!.split("-").map(Number);
  const [endYear, endMonth] = keys.at(-1)!.split("-").map(Number);
  const cursor = new Date(Date.UTC(startYear!, startMonth! - 1, 1));
  const end = new Date(Date.UTC(endYear!, endMonth! - 1, 1));
  const series: ReportMonth[] = [];
  while (cursor <= end) {
    const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`;
    const monthRows = grouped.get(key);
    if (!monthRows) {
      series.push({
        key,
        label: monthLabel(key),
        revenue: null,
        expenses: null,
        result: null,
        hasActivity: false,
      });
    } else {
      const summary = summarize(monthRows);
      series.push({
        key,
        label: monthLabel(key),
        revenue: summary.revenue,
        expenses: summary.expenses,
        result: summary.result,
        hasActivity: true,
      });
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return series;
}

function groupingValue(row: Transaction, grouping: ReportGrouping) {
  if (grouping.type === "category") {
    const key = categoryKey(row);
    return { key, label: key === EMPTY_CATEGORY ? "Sem categoria" : key };
  }
  if (grouping.type === "month") {
    const key = row.date.slice(0, 7);
    return { key, label: monthLabel(key) };
  }
  const value = row.additionalData?.[grouping.columnId];
  return { key: reportDimensionValueKey(value), label: reportDimensionValueLabel(value) };
}

function groupRows(rows: Transaction[], grouping: ReportGrouping, movement: number): ReportGroup[] {
  const grouped = new Map<string, { label: string; rows: Transaction[] }>();
  rows.forEach((row) => {
    const group = groupingValue(row, grouping);
    const current = grouped.get(group.key) ?? { label: group.label, rows: [] };
    current.rows.push(row);
    grouped.set(group.key, current);
  });
  return [...grouped.entries()]
    .map(([key, group]) => {
      const summary = summarize(group.rows);
      return {
        key,
        label: group.label,
        transactionCount: group.rows.length,
        revenue: summary.revenue,
        expenses: summary.expenses,
        result: summary.result,
        participation: movement ? (summary.movement / movement) * 100 : 0,
      };
    })
    .sort((a, b) => b.participation - a.participation || a.label.localeCompare(b.label, "pt-BR"));
}

function columnExists(columns: ImportedColumn[], columnId: string | undefined) {
  return Boolean(columnId && columns.some((column) => column.id === columnId));
}

export function buildFinancialReport(
  rows: Transaction[],
  filters: ReportFilters,
  options: ReportOptions = {},
): FinancialReport {
  const valid: Transaction[] = [];
  let invalidDateCount = 0;
  rows.forEach((row) => {
    const date = parseCalendarDate(row.date);
    if (!date) invalidDateCount += 1;
    else if (Number.isFinite(row.amount)) valid.push({ ...row, date });
  });
  const invalidRange =
    !filters.startDate || !filters.endDate || filters.startDate > filters.endDate;
  const columns = options.columns ?? [];
  const dimensionColumnId = columnExists(columns, filters.dimensionColumnId)
    ? filters.dimensionColumnId
    : undefined;
  const grouping =
    filters.grouping.type === "dimension" && !columnExists(columns, filters.grouping.columnId)
      ? ({ type: "category" } as const)
      : filters.grouping;
  const categorySet = new Set(filters.categories);
  const dimensionSet = new Set(filters.dimensionValueKeys);
  const transactions = invalidRange
    ? []
    : valid
        .filter((row) => row.date >= filters.startDate && row.date <= filters.endDate)
        .filter((row) => filters.type === "all" || row.type === filters.type)
        .filter((row) => !categorySet.size || categorySet.has(categoryKey(row)))
        .filter(
          (row) =>
            !dimensionColumnId ||
            !dimensionSet.size ||
            dimensionSet.has(reportDimensionValueKey(row.additionalData?.[dimensionColumnId])),
        )
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            a.description.localeCompare(b.description, "pt-BR") ||
            a.id.localeCompare(b.id),
        );
  const summary = summarize(transactions);
  const coverageColumnId = grouping.type === "dimension" ? grouping.columnId : dimensionColumnId;
  const coverageColumn = columns.find((column) => column.id === coverageColumnId);
  const informed = coverageColumn
    ? transactions.filter(
        (row) => reportDimensionValueKey(row.additionalData?.[coverageColumn.id]) !== "empty:",
      ).length
    : 0;
  return {
    filters: { ...filters, ...(dimensionColumnId ? { dimensionColumnId } : {}), grouping },
    transactions,
    summary,
    months: monthlySeries(transactions),
    groups: groupRows(transactions, grouping, summary.movement),
    ...(coverageColumn
      ? {
          dimensionCoverage: {
            columnId: coverageColumn.id,
            header: coverageColumn.header,
            informed,
            total: transactions.length,
            percentage: transactions.length ? (informed / transactions.length) * 100 : 0,
          },
        }
      : {}),
    invalidDateCount,
    invalidRange,
  };
}
