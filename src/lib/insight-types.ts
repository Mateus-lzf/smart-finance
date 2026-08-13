export type InsightLevel = "positivo" | "atencao" | "informativo" | "mudanca";

export type InsightKind =
  | "result"
  | "margin"
  | "expense-concentration"
  | "revenue-change"
  | "expense-change"
  | "expense-change-driver"
  | "revenue-concentration"
  | "outlier"
  | "dimension-concentration";

export type InsightEvidence = {
  periodLabel: string;
  transactionCount: number;
  currentValue?: number;
  previousValue?: number;
  absoluteChange?: number;
  percentageChange?: number;
  share?: number;
  coverage?: number;
};

export type InsightDiscovery = {
  basis: "receitas" | "despesas" | "lançamentos";
  dominantValue: string;
  periodKey: string;
  share: number;
  value: number;
};

export type Insight = {
  id: string;
  kind: InsightKind;
  level: InsightLevel;
  title: string;
  body: string;
  metric?: string;
  periodLabel: string;
  score: number;
  evidence: InsightEvidence;
  redundancyGroup: string;
  discovery?: InsightDiscovery;
};

export type DimensionAnalysis = {
  columnId: string;
  columnLabel: string;
  status: "available" | "insufficient-data" | "insufficient-coverage" | "no-material-finding";
  insight?: Insight;
  message?: string;
};

export type InsightAnalysisState =
  | "no-transactions"
  | "composition-only"
  | "temporal-data-insufficient"
  | "insights-available"
  | "no-material-findings";

export type InsightAnalysis = {
  insights: Insight[];
  dimensionAnalyses: DimensionAnalysis[];
  state: InsightAnalysisState;
  context: {
    analyzedPeriod: string;
    validTransactionCount: number;
    hasComparablePeriod: boolean;
  };
};
