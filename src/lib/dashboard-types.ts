import type { Transaction } from "./finance-types";

export type DashboardComparison =
  | {
      state: "comparable";
      current: number;
      previous: number;
      difference: number;
      percentage: number;
      previousPeriodLabel: string;
    }
  | {
      state: "absolute";
      current: number;
      previous: number;
      difference: number;
      previousPeriodLabel: string;
      signChange: "none" | "positive-to-negative" | "negative-to-positive";
    }
  | {
      state: "zero-base";
      current: number;
      previousPeriodLabel: string;
    }
  | { state: "no-comparable-period" };

export type DashboardKpi = {
  value: number | null;
  comparison?: DashboardComparison;
};

export type DashboardMonth = {
  key: string;
  label: string;
  revenue: number | null;
  expenses: number | null;
  result: number | null;
  hasActivity: boolean;
};

export type DashboardCategory = {
  name: string;
  amount: number;
  share: number;
};

export type DashboardPeriod = {
  year: number;
  month: number;
  cutoff: number;
  startDate: string;
  endDate: string;
  label: string;
  contextLabel: string;
  isFullMonth: boolean;
};

export type DashboardPeriodSummary = {
  largestRevenue: Transaction | null;
  largestExpense: Transaction | null;
  revenueCount: number;
  expenseCount: number;
};

export type DashboardAnalysis = {
  state: "no-transactions" | "available";
  period: DashboardPeriod | null;
  previousPeriodLabel: string | null;
  transactionCount: number;
  invalidDateCount: number;
  kpis: {
    revenue: DashboardKpi;
    expenses: DashboardKpi;
    result: DashboardKpi;
    margin: DashboardKpi;
  };
  months: DashboardMonth[];
  expenseCategories: DashboardCategory[];
  periodSummary: DashboardPeriodSummary;
  recentTransactions: Transaction[];
};
