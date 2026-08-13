import type { ImportedColumn, Transaction } from "./finance-types";
import type { DimensionAnalysis, Insight, InsightAnalysis } from "./insight-types";
import { parseCalendarDate } from "./calendar-date";

type Period = {
  year: number;
  month: number;
  cutoff: number;
  rows: Transaction[];
  label: string;
};

type Context = {
  current: Period;
  previous: Period;
  hasPreviousData: boolean;
};

export type InsightOptions = {
  selectedDimensionIds?: string[];
  columns?: ImportedColumn[];
  maxInsights?: number;
};

const brl = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const percent = (value: number) => `${value.toFixed(1).replace(".", ",")}%`;
const total = (rows: Transaction[], type: Transaction["type"]) =>
  rows.filter((row) => row.type === type).reduce((sum, row) => sum + Math.abs(row.amount), 0);
const normalize = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function periodLabel(year: number, month: number, cutoff: number) {
  const end = String(cutoff).padStart(2, "0");
  const mon = String(month).padStart(2, "0");
  return `01/${mon}/${year}–${end}/${mon}/${year}`;
}

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

function comparisonText(context: Context) {
  const previousMonth = monthNames[context.previous.month - 1]!;
  const currentMonth = monthNames[context.current.month - 1]!;
  const changesYear = context.previous.year !== context.current.year;
  const previousLabel = `${previousMonth}${changesYear ? ` de ${context.previous.year}` : ""}`;
  const currentLabel = `${currentMonth}${changesYear ? ` de ${context.current.year}` : ""}`;
  const fullMonths =
    context.previous.cutoff === daysInMonth(context.previous.year, context.previous.month) &&
    context.current.cutoff === daysInMonth(context.current.year, context.current.month);
  if (fullMonths) return `Entre ${previousLabel} e ${currentLabel}`;
  return `Entre 1 e ${context.previous.cutoff} de ${previousLabel} e o mesmo período de ${currentLabel}`;
}

function prepareContext(rows: Transaction[]): Context | null {
  const valid = rows
    .filter((row) => Number.isFinite(row.amount) && parseCalendarDate(row.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = valid.at(-1);
  if (!latest) return null;
  const [year, month, cutoff] = latest.date.split("-").map(Number) as [number, number, number];
  const previousDate = new Date(Date.UTC(year, month - 2, 1));
  const previousYear = previousDate.getUTCFullYear();
  const previousMonth = previousDate.getUTCMonth() + 1;
  const previousCutoff = Math.min(cutoff, daysInMonth(previousYear, previousMonth));
  const inPeriod = (row: Transaction, y: number, m: number, end: number) => {
    const [rowYear, rowMonth, rowDay] = row.date.split("-").map(Number);
    return rowYear === y && rowMonth === m && rowDay! <= end;
  };
  const currentRows = valid.filter((row) => inPeriod(row, year, month, cutoff));
  const previousRows = valid.filter((row) =>
    inPeriod(row, previousYear, previousMonth, previousCutoff),
  );
  return {
    current: {
      year,
      month,
      cutoff,
      rows: currentRows,
      label: periodLabel(year, month, cutoff),
    },
    previous: {
      year: previousYear,
      month: previousMonth,
      cutoff: previousCutoff,
      rows: previousRows,
      label: periodLabel(previousYear, previousMonth, previousCutoff),
    },
    hasPreviousData: previousRows.length > 0,
  };
}

function insight(input: Insight): Insight {
  return input;
}

function resultInsight(context: Context): Insight | null {
  const rows = context.current.rows;
  if (!rows.length) return null;
  const revenue = total(rows, "receita");
  const expenses = total(rows, "despesa");
  const result = revenue - expenses;
  if (!revenue && !expenses) return null;
  const coverage = expenses > 0 ? (revenue / expenses) * 100 : null;
  const ratio = expenses > 0 ? revenue / expenses : null;
  const negative = result < 0;
  const body = !revenue
    ? `Foram registradas ${brl(expenses)} em despesas e nenhuma receita no período analisado.`
    : !expenses
      ? `Você registrou ${brl(revenue)} em receitas e nenhuma despesa no período analisado.`
      : negative
        ? `Você registrou ${brl(revenue)} em receitas e ${brl(expenses)} em despesas. As despesas ficaram ${brl(Math.abs(result))} acima das receitas.`
        : `Você registrou ${brl(revenue)} em receitas e ${brl(expenses)} em despesas. As receitas foram ${ratio!.toFixed(1).replace(".", ",")}x maiores, deixando resultado positivo de ${brl(result)}.`;
  return insight({
    id: "result",
    kind: "result",
    level: negative ? "atencao" : revenue && expenses ? "positivo" : "informativo",
    title: negative ? "Despesas ficaram acima das receitas" : "Receitas ficaram acima das despesas",
    body,
    metric: brl(result),
    periodLabel: context.current.label,
    score: Math.min(100, 70 + (Math.abs(result) / Math.max(revenue + expenses, 1)) * 25),
    evidence: {
      periodLabel: context.current.label,
      transactionCount: rows.length,
      currentValue: result,
      ...(coverage === null ? {} : { share: coverage }),
    },
    redundancyGroup: "period-result",
  });
}

function marginInsight(context: Context): Insight | null {
  const rows = context.current.rows;
  const revenue = total(rows, "receita");
  const expenses = total(rows, "despesa");
  if (!revenue || !expenses || rows.length < 2) return null;
  const margin = ((revenue - expenses) / revenue) * 100;
  return insight({
    id: "margin",
    kind: "margin",
    level: margin < 0 ? "atencao" : "positivo",
    title:
      margin < 0
        ? "Despesas consumiram mais que a receita"
        : "Parte da receita permaneceu como resultado",
    body: `O resultado foi de ${brl(revenue - expenses)} sobre ${brl(revenue)} em receitas, equivalente a ${percent(margin)}.`,
    metric: percent(margin),
    periodLabel: context.current.label,
    score: Math.min(82, 42 + Math.abs(margin) / 2 + Math.min(rows.length, 10)),
    evidence: {
      periodLabel: context.current.label,
      transactionCount: rows.length,
      currentValue: revenue - expenses,
      share: margin,
    },
    redundancyGroup: margin < 0 ? "period-result" : "margin",
  });
}

function groupAmounts(rows: Transaction[], key: (row: Transaction) => string) {
  const grouped = new Map<string, { label: string; value: number; count: number }>();
  rows.forEach((row) => {
    const label = key(row).trim();
    const normalized = normalize(label);
    if (!normalized) return;
    const current = grouped.get(normalized) ?? { label, value: 0, count: 0 };
    current.value += Math.abs(row.amount);
    current.count += 1;
    grouped.set(normalized, current);
  });
  return [...grouped.values()].sort((a, b) => b.value - a.value);
}

function expenseConcentration(context: Context): Insight | null {
  const expenses = context.current.rows.filter((row) => row.type === "despesa");
  if (expenses.length < 2) return null;
  const groups = groupAmounts(expenses, (row) => row.category).filter(
    (group) => normalize(group.label) !== "sem categoria",
  );
  if (groups.length < 2) return null;
  const expenseTotal = total(expenses, "despesa");
  const top = groups[0]!;
  const share = expenseTotal ? (top.value / expenseTotal) * 100 : 0;
  if (share < 35) return null;
  return insight({
    id: `expense-concentration:${normalize(top.label)}`,
    kind: "expense-concentration",
    level: share >= 60 ? "atencao" : "informativo",
    title: `${top.label} teve a maior participação nas despesas`,
    body: `${top.label} somou ${brl(top.value)} de um total de ${brl(expenseTotal)} em despesas, representando ${percent(share)} do período.`,
    metric: percent(share),
    periodLabel: context.current.label,
    score: Math.min(90, 45 + share / 2 + Math.min(expenses.length, 10)),
    evidence: {
      periodLabel: context.current.label,
      transactionCount: expenses.length,
      currentValue: top.value,
      share,
    },
    redundancyGroup: "expense-composition",
    discovery: {
      basis: "despesas",
      dominantValue: normalize(top.label),
      periodKey: context.current.label,
      share,
      value: top.value,
    },
  });
}

function comparableChange(context: Context, type: Transaction["type"]): Insight | null {
  const currentRows = context.current.rows.filter((row) => row.type === type);
  const previousRows = context.previous.rows.filter((row) => row.type === type);
  if (currentRows.length < 2 || previousRows.length < 2) return null;
  const current = total(currentRows, type);
  const previous = total(previousRows, type);
  if (previous <= 0) return null;
  const change = current - previous;
  const relative = (change / previous) * 100;
  const average = (current + previous) / 2;
  if (Math.abs(relative) < 10 || Math.abs(change) < average * 0.05) return null;
  const noun = type === "receita" ? "receitas" : "despesas";
  const verb = change >= 0 ? "aumentaram" : "diminuíram";
  const kind = type === "receita" ? "revenue-change" : "expense-change";
  return insight({
    id: kind,
    kind,
    level: "mudanca",
    title: `${noun[0]!.toUpperCase()}${noun.slice(1)} ${verb}`,
    body: `${comparisonText(context)}, as ${noun} passaram de ${brl(previous)} para ${brl(current)} — ${change >= 0 ? "aumento" : "redução"} de ${brl(Math.abs(change))} (${percent(Math.abs(relative))}).`,
    metric: `${change >= 0 ? "+" : "−"}${percent(Math.abs(relative))}`,
    periodLabel: `${context.previous.label} comparado a ${context.current.label}`,
    score: Math.min(
      95,
      52 +
        Math.min(Math.abs(relative), 60) / 2 +
        Math.min(currentRows.length + previousRows.length, 12),
    ),
    evidence: {
      periodLabel: `${context.previous.label} comparado a ${context.current.label}`,
      transactionCount: currentRows.length + previousRows.length,
      currentValue: current,
      previousValue: previous,
      absoluteChange: change,
      percentageChange: relative,
    },
    redundancyGroup: kind,
  });
}

function expenseChangeDriver(context: Context): Insight | null {
  const currentRows = context.current.rows.filter((row) => row.type === "despesa");
  const previousRows = context.previous.rows.filter((row) => row.type === "despesa");
  if (currentRows.length < 2 || previousRows.length < 2) return null;
  const currentTotal = total(currentRows, "despesa");
  const previousTotal = total(previousRows, "despesa");
  const totalChange = currentTotal - previousTotal;
  const relativeChange = previousTotal ? Math.abs(totalChange / previousTotal) * 100 : 0;
  if (
    !previousTotal ||
    relativeChange < 10 ||
    Math.abs(totalChange) < ((currentTotal + previousTotal) / 2) * 0.05
  )
    return null;
  const current = new Map(
    groupAmounts(currentRows, (row) => row.category).map((g) => [normalize(g.label), g]),
  );
  const previous = new Map(
    groupAmounts(previousRows, (row) => row.category).map((g) => [normalize(g.label), g]),
  );
  const keys = new Set([...current.keys(), ...previous.keys()]);
  const changes = [...keys]
    .map((key) => ({
      label: current.get(key)?.label ?? previous.get(key)?.label ?? key,
      change: (current.get(key)?.value ?? 0) - (previous.get(key)?.value ?? 0),
      count: (current.get(key)?.count ?? 0) + (previous.get(key)?.count ?? 0),
    }))
    .filter((item) => normalize(item.label) !== "sem categoria" && item.count >= 2)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  const top = changes[0];
  if (!top || Math.abs(top.change) < Math.abs(totalChange) * 0.3) return null;
  return insight({
    id: `expense-driver:${normalize(top.label)}`,
    kind: "expense-change-driver",
    level: "mudanca",
    title: `${top.label} teve a maior mudança nas despesas`,
    body: `${comparisonText(context)}, ${top.label} registrou ${top.change > 0 ? "aumento" : "redução"} de ${brl(Math.abs(top.change))} e foi a categoria que mais contribuiu para a mudança total das despesas.`,
    metric: `${top.change > 0 ? "+" : "−"}${brl(Math.abs(top.change))}`,
    periodLabel: `${context.previous.label} comparado a ${context.current.label}`,
    score: Math.min(92, 48 + Math.abs(top.change / totalChange) * 25 + Math.min(top.count, 10)),
    evidence: {
      periodLabel: `${context.previous.label} comparado a ${context.current.label}`,
      transactionCount: top.count,
      absoluteChange: top.change,
      share: Math.abs(top.change / totalChange) * 100,
    },
    redundancyGroup: "expense-change-driver",
  });
}

function revenueConcentration(context: Context): Insight | null {
  const revenues = context.current.rows.filter((row) => row.type === "receita");
  if (revenues.length < 3) return null;
  const groups = groupAmounts(revenues, (row) => row.description);
  if (groups.length < 2) return null;
  const revenueTotal = total(revenues, "receita");
  const top = groups[0]!;
  const share = (top.value / revenueTotal) * 100;
  if (share < 40) return null;
  return insight({
    id: `revenue-concentration:${normalize(top.label)}`,
    kind: "revenue-concentration",
    level: share >= 70 ? "atencao" : "informativo",
    title: `“${top.label}” teve a maior participação nas receitas`,
    body: `Essa descrição somou ${brl(top.value)} de um total de ${brl(revenueTotal)} em receitas, representando ${percent(share)} do período.`,
    metric: percent(share),
    periodLabel: context.current.label,
    score: Math.min(88, 42 + share / 2 + Math.min(revenues.length, 10)),
    evidence: {
      periodLabel: context.current.label,
      transactionCount: revenues.length,
      currentValue: top.value,
      share,
    },
    redundancyGroup: "revenue-composition",
    discovery: {
      basis: "receitas",
      dominantValue: normalize(top.label),
      periodKey: context.current.label,
      share,
      value: top.value,
    },
  });
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function outlierInsight(context: Context, type: Transaction["type"]): Insight | null {
  const rows = context.current.rows.filter((row) => row.type === type);
  if (rows.length < 8) return null;
  const values = rows.map((row) => Math.abs(row.amount));
  const center = median(values);
  const deviations = values.map((value) => Math.abs(value - center));
  const mad = median(deviations);
  const largest = rows.reduce((best, row) => (row.amount > best.amount ? row : best));
  const distance = Math.abs(largest.amount - center);
  const robustOutlier = mad > 0 ? distance / mad >= 3.5 : largest.amount >= center * 3;
  if (!robustOutlier || largest.amount < center * 1.75) return null;
  const label = type === "receita" ? "receita" : "despesa";
  return insight({
    id: `outlier:${type}:${largest.id}`,
    kind: "outlier",
    level: "atencao",
    title: `Valor de ${label} fora do padrão`,
    body: `Uma ${label} de ${brl(largest.amount)} ficou significativamente acima do valor típico de ${brl(center)} das demais ${label}s registradas. O lançamento pode merecer revisão.`,
    metric: brl(largest.amount),
    periodLabel: context.current.label,
    score: Math.min(
      90,
      48 + Math.min(distance / Math.max(mad, center * 0.1), 12) * 3 + Math.min(rows.length, 12),
    ),
    evidence: {
      periodLabel: context.current.label,
      transactionCount: rows.length,
      currentValue: largest.amount,
    },
    redundancyGroup: `outlier:${type}`,
  });
}

type DimensionBasis = "receitas" | "despesas" | "lançamentos";

function dimensionPreference(header: string): DimensionBasis | "material" {
  const name = normalize(header);
  if (["vendedor", "vendedora", "salesperson", "cliente", "customer"].includes(name))
    return "receitas";
  if (["centro de custo", "cost center"].includes(name)) return "despesas";
  if (["forma de pagamento", "meio de pagamento", "payment method"].includes(name))
    return "lançamentos";
  return "material";
}

function dimensionFindingText(
  label: string,
  header: string,
  basis: DimensionBasis,
  share: number,
  partialCoverage: boolean,
) {
  const subject = basis === "lançamentos" ? "dos lançamentos" : `das ${basis}`;
  const scope = partialCoverage
    ? ` entre os lançamentos que têm ${header} informado`
    : " do período";
  const verb = basis === "lançamentos" ? "representou" : "concentrou";
  return `“${label}” ${verb} ${percent(share)} ${subject}${scope}.`;
}

function dimensionInsights(context: Context, options: InsightOptions): DimensionAnalysis[] {
  const columns = new Map((options.columns ?? []).map((column) => [column.id, column]));
  return [...new Set(options.selectedDimensionIds ?? [])]
    .slice(0, 3)
    .flatMap<DimensionAnalysis>((columnId) => {
      const column = columns.get(columnId);
      if (!column) return [];
      const eligible = context.current.rows;
      const informed = eligible.filter((row) => {
        const value = row.additionalData?.[column.id];
        return value !== null && value !== undefined && String(value).trim() !== "";
      });
      const coverage = eligible.length ? (informed.length / eligible.length) * 100 : 0;
      if (informed.length < 3)
        return [
          {
            columnId: column.id,
            columnLabel: column.header,
            status: "insufficient-data",
            message: `Ainda não há lançamentos suficientes com ${column.header} informado para gerar uma análise confiável.`,
          },
        ];
      if (coverage < 60)
        return [
          {
            columnId: column.id,
            columnLabel: column.header,
            status: "insufficient-coverage",
            message: `A informação de ${column.header} está preenchida em apenas ${percent(coverage)} dos lançamentos. É necessário maior cobertura para gerar uma análise confiável.`,
          },
        ];
      const groups = new Map<
        string,
        { label: string; count: number; revenue: number; expenses: number }
      >();
      informed.forEach((row) => {
        const label = String(row.additionalData![column.id]).trim();
        const key = normalize(label);
        const group = groups.get(key) ?? { label, count: 0, revenue: 0, expenses: 0 };
        group.count += 1;
        if (row.type === "receita") group.revenue += Math.abs(row.amount);
        else group.expenses += Math.abs(row.amount);
        groups.set(key, group);
      });
      if (groups.size < 2)
        return [
          {
            columnId: column.id,
            columnLabel: column.header,
            status: "no-material-finding",
            message: `Os dados de ${column.header} não possuem variedade suficiente para destacar uma concentração.`,
          },
        ];
      const candidates: Array<{
        label: string;
        value: number;
        share: number;
        basis: DimensionBasis;
      }> = [];
      const revenue = total(informed, "receita");
      const expenses = total(informed, "despesa");
      const count = informed.length;
      [...groups.values()].forEach((group) => {
        if (revenue)
          candidates.push({
            label: group.label,
            value: group.revenue,
            share: (group.revenue / revenue) * 100,
            basis: "receitas",
          });
        if (expenses)
          candidates.push({
            label: group.label,
            value: group.expenses,
            share: (group.expenses / expenses) * 100,
            basis: "despesas",
          });
        candidates.push({
          label: group.label,
          value: group.count,
          share: (group.count / count) * 100,
          basis: "lançamentos",
        });
      });
      const preference = dimensionPreference(column.header);
      const preferred =
        preference === "material"
          ? candidates
          : candidates.filter((candidate) => candidate.basis === preference);
      const top = preferred.sort((a, b) => b.share - a.share)[0];
      if (!top || top.share < 40)
        return [
          {
            columnId: column.id,
            columnLabel: column.header,
            status: "no-material-finding",
            message: `Nenhuma concentração relevante foi encontrada em ${column.header} no período analisado.`,
          },
        ];
      const partialCoverage = coverage < 100;
      const coverageText = partialCoverage
        ? ` A informação de ${column.header} está preenchida em ${percent(coverage)} dos lançamentos analisados.`
        : "";
      return [
        {
          columnId: column.id,
          columnLabel: column.header,
          status: "available",
          insight: insight({
            id: `dimension:${column.id}:${normalize(top.label)}:${top.basis}`,
            kind: "dimension-concentration",
            level: top.share >= 70 ? "atencao" : "informativo",
            title: `“${top.label}” teve a maior participação em ${column.header}`,
            body: `${dimensionFindingText(top.label, column.header, top.basis, top.share, partialCoverage)}${coverageText}`,
            metric: percent(top.share),
            periodLabel: context.current.label,
            score: Math.min(86, 38 + top.share / 2 + coverage / 10),
            evidence: {
              periodLabel: context.current.label,
              transactionCount: informed.length,
              currentValue: top.value,
              share: top.share,
              coverage,
            },
            redundancyGroup: `dimension:${column.id}`,
            discovery: {
              basis: top.basis,
              dominantValue: normalize(top.label),
              periodKey: context.current.label,
              share: top.share,
              value: top.value,
            },
          }),
        },
      ];
    });
}

function sameDiscovery(automatic: Insight, dimensional: Insight) {
  const left = automatic.discovery;
  const right = dimensional.discovery;
  if (!left || !right) return false;
  return (
    left.basis === right.basis &&
    left.dominantValue === right.dominantValue &&
    left.periodKey === right.periodKey &&
    Math.abs(left.share - right.share) < 0.05 &&
    Math.abs(left.value - right.value) < 0.01
  );
}

function selectInsights(candidates: Insight[], max: number) {
  const selected: Insight[] = [];
  const groups = new Set<string>();
  for (const candidate of [...candidates].sort((a, b) => b.score - a.score)) {
    if (groups.has(candidate.redundancyGroup)) continue;
    selected.push(candidate);
    groups.add(candidate.redundancyGroup);
    if (selected.length === max) break;
  }
  return selected;
}

export function analyzeInsights(
  rows: Transaction[],
  options: InsightOptions = {},
): InsightAnalysis {
  const context = prepareContext(rows);
  if (!context)
    return {
      insights: [],
      dimensionAnalyses: [],
      state: "no-transactions",
      context: { analyzedPeriod: "", validTransactionCount: 0, hasComparablePeriod: false },
    };
  const dimensionAnalyses = dimensionInsights(context, options);
  const dimensionalInsights = dimensionAnalyses.flatMap((item) =>
    item.insight ? [item.insight] : [],
  );
  const candidates = [
    resultInsight(context),
    marginInsight(context),
    expenseConcentration(context),
    comparableChange(context, "receita"),
    comparableChange(context, "despesa"),
    expenseChangeDriver(context),
    revenueConcentration(context),
    outlierInsight(context, "receita"),
    outlierInsight(context, "despesa"),
  ].filter((candidate): candidate is Insight => candidate !== null);
  const nonRedundantCandidates = candidates.filter(
    (candidate) => !dimensionalInsights.some((item) => sameDiscovery(candidate, item)),
  );
  const insights = selectInsights(
    nonRedundantCandidates,
    Math.min(6, Math.max(1, options.maxInsights ?? 6)),
  );
  const hasTemporalInsight = insights.some((item) =>
    ["revenue-change", "expense-change", "expense-change-driver"].includes(item.kind),
  );
  const state = insights.length
    ? !context.hasPreviousData
      ? "composition-only"
      : !hasTemporalInsight
        ? "temporal-data-insufficient"
        : "insights-available"
    : context.hasPreviousData
      ? "no-material-findings"
      : "composition-only";
  return {
    insights,
    dimensionAnalyses,
    state,
    context: {
      analyzedPeriod: context.current.label,
      validTransactionCount: context.current.rows.length,
      hasComparablePeriod: context.hasPreviousData,
    },
  };
}
