import type { ImportedColumn, ImportedValue, Transaction, TransactionType } from "./finance-types";

export type ReportTypeFilter = "all" | TransactionType;
export type ReportGrouping =
  { type: "category" } | { type: "month" } | { type: "dimension"; columnId: string };

export type ReportDimensionValue = {
  key: string;
  value: ImportedValue | undefined;
  label: string;
};

export type ReportFilters = {
  startDate: string;
  endDate: string;
  type: ReportTypeFilter;
  categories: string[];
  dimensionColumnId?: string;
  dimensionValueKeys: string[];
  grouping: ReportGrouping;
};

export type ReportSummary = {
  revenue: number;
  expenses: number;
  result: number;
  margin: number | null;
  transactionCount: number;
  movement: number;
};

export type ReportMonth = {
  key: string;
  label: string;
  revenue: number | null;
  expenses: number | null;
  result: number | null;
  hasActivity: boolean;
};

export type ReportGroup = {
  key: string;
  label: string;
  transactionCount: number;
  revenue: number;
  expenses: number;
  result: number;
  participation: number;
};

export type ReportDimensionCoverage = {
  columnId: string;
  header: string;
  informed: number;
  total: number;
  percentage: number;
};

export type FinancialReport = {
  filters: ReportFilters;
  transactions: Transaction[];
  summary: ReportSummary;
  months: ReportMonth[];
  groups: ReportGroup[];
  dimensionCoverage?: ReportDimensionCoverage;
  invalidDateCount: number;
  invalidRange: boolean;
};

export type ReportOptions = {
  columns?: ImportedColumn[];
};
