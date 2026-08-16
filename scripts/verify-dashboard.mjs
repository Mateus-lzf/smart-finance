import assert from "node:assert/strict";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const { buildDashboardAnalysis } = await vite.ssrLoadModule("/src/lib/dashboard-service.ts");
  let id = 0;
  const row = (date, type, amount, category = "Geral", origin = "imported") => ({
    id: `dashboard-${id++}`,
    date,
    type,
    amount,
    category,
    description: `Lançamento ${id}`,
    origin,
  });

  const empty = buildDashboardAnalysis([]);
  assert.equal(empty.state, "no-transactions");
  assert.equal(empty.kpis.margin.value, null);
  assert.deepEqual(empty.periodSummary, {
    largestRevenue: null,
    largestExpense: null,
    revenueCount: 0,
    expenseCount: 0,
  });

  const invalid = buildDashboardAnalysis([row("data inválida", "receita", 100)]);
  assert.equal(invalid.state, "no-transactions");
  assert.equal(invalid.invalidDateCount, 1);

  const partial = buildDashboardAnalysis([
    row("2026-07-03", "receita", 1000),
    row("2026-07-12", "despesa", 200),
    row("2026-07-20", "receita", 9000),
    row("2026-08-02", "receita", 1500),
    row("2026-08-12", "despesa", 300),
  ]);
  assert.equal(partial.period.endDate, "2026-08-12");
  assert.equal(partial.period.isFullMonth, false);
  assert.equal(partial.period.contextLabel, "Dados registrados de 1 a 12 de agosto de 2026");
  assert.equal(partial.kpis.revenue.value, 1500);
  assert.equal(partial.kpis.revenue.comparison.previous, 1000);
  assert.equal(partial.kpis.revenue.comparison.percentage, 50);
  assert.equal(partial.kpis.result.comparison.state, "absolute");
  assert.equal(partial.kpis.result.comparison.difference, 400);
  assert.equal("percentage" in partial.kpis.result.comparison, false);

  const full = buildDashboardAnalysis([
    row("2026-07-31", "receita", 100),
    row("2026-08-31", "receita", 200),
  ]);
  assert.equal(full.period.isFullMonth, true);
  assert.equal(full.period.contextLabel, "Dados registrados em agosto de 2026");

  const yearChange = buildDashboardAnalysis([
    row("2026-12-15", "receita", 100),
    row("2027-01-15", "receita", 125),
  ]);
  assert.equal(yearChange.previousPeriodLabel, "1 a 15 de dezembro de 2026");
  assert.equal(yearChange.kpis.revenue.comparison.percentage, 25);

  const missingPrevious = buildDashboardAnalysis([
    row("2026-01-10", "receita", 100),
    row("2026-03-10", "receita", 200),
  ]);
  assert.equal(missingPrevious.kpis.revenue.comparison.state, "no-comparable-period");
  assert.equal(missingPrevious.months.find((month) => month.key === "2026-02").hasActivity, false);
  assert.equal(missingPrevious.months.find((month) => month.key === "2026-02").revenue, null);
  assert.equal(missingPrevious.months[0].key, "2026-01");
  assert.equal(missingPrevious.months.length, 3);

  const zeroRevenueBase = buildDashboardAnalysis([
    row("2026-07-10", "despesa", 100),
    row("2026-08-10", "receita", 500),
  ]);
  assert.equal(zeroRevenueBase.kpis.revenue.comparison.state, "zero-base");
  assert.notEqual(zeroRevenueBase.kpis.revenue.comparison.percentage, 100);

  const zeroExpenseBase = buildDashboardAnalysis([
    row("2026-07-10", "receita", 100),
    row("2026-08-10", "despesa", 50),
  ]);
  assert.equal(zeroExpenseBase.kpis.expenses.comparison.state, "zero-base");

  const onlyRevenue = buildDashboardAnalysis([row("2026-08-31", "receita", -1000)]);
  assert.equal(onlyRevenue.kpis.revenue.value, 1000);
  assert.equal(onlyRevenue.kpis.expenses.value, 0);
  assert.equal(onlyRevenue.kpis.result.value, 1000);
  assert.equal(onlyRevenue.kpis.margin.value, 100);
  assert.equal(onlyRevenue.months.length, 1);
  assert.equal(onlyRevenue.months[0].revenue, 1000);
  assert.equal(onlyRevenue.months[0].expenses, 0);
  assert.equal(onlyRevenue.periodSummary.largestRevenue.amount, -1000);
  assert.equal(onlyRevenue.periodSummary.largestExpense, null);
  assert.equal(onlyRevenue.periodSummary.revenueCount, 1);
  assert.equal(onlyRevenue.periodSummary.expenseCount, 0);

  const onlyExpenses = buildDashboardAnalysis([row("2026-08-31", "despesa", -250)]);
  assert.equal(onlyExpenses.kpis.revenue.value, 0);
  assert.equal(onlyExpenses.kpis.result.value, -250);
  assert.equal(onlyExpenses.kpis.margin.value, null);
  assert.equal(onlyExpenses.months[0].revenue, 0);
  assert.equal(onlyExpenses.months[0].expenses, 250);
  assert.equal(onlyExpenses.periodSummary.largestRevenue, null);
  assert.equal(onlyExpenses.periodSummary.largestExpense.amount, -250);

  const signChange = buildDashboardAnalysis([
    row("2026-07-10", "receita", 100),
    row("2026-07-10", "despesa", 200),
    row("2026-08-10", "receita", 300),
    row("2026-08-10", "despesa", 100),
  ]);
  assert.equal(signChange.kpis.result.comparison.signChange, "negative-to-positive");
  assert.equal(signChange.kpis.result.comparison.difference, 300);

  const categories = buildDashboardAnalysis([
    row("2026-07-31", "despesa", 900, "Antiga"),
    row("2026-08-31", "receita", 1000),
    row("2026-08-31", "despesa", 300, "Marketing"),
    row("2026-08-31", "despesa", 100, ""),
  ]);
  assert.deepEqual(
    categories.expenseCategories.map((category) => category.name),
    ["Marketing", "Sem categoria"],
  );
  assert.equal(categories.expenseCategories[0].share, 75);
  assert.equal(categories.kpis.expenses.value, 400);
  assert.equal(categories.periodSummary.revenueCount, 1);
  assert.equal(categories.periodSummary.expenseCount, 2);
  assert.equal(categories.periodSummary.largestRevenue.amount, 1000);
  assert.equal(categories.periodSummary.largestExpense.amount, 300);
  assert.equal(
    categories.periodSummary.revenueCount + categories.periodSummary.expenseCount,
    categories.transactionCount,
  );

  const recentRows = [
    row("2026-07-31", "receita", 900, "Anterior"),
    row("2026-08-03", "despesa", 10, "A"),
    row("2026-08-03", "receita", 20, "A", "manual"),
    row("2026-08-04", "despesa", 30, "B"),
    row("2026-08-05", "receita", 40, "C"),
    row("2026-08-06", "despesa", 50, "D"),
    row("2026-08-07", "receita", 60, "E"),
    row("2026-08-08", "despesa", 70, "F", "manual"),
    row("data inválida", "receita", 999, "Inválida"),
  ];
  const recent = buildDashboardAnalysis(recentRows);
  assert.equal(recent.recentTransactions.length, 6);
  assert.deepEqual(
    recent.recentTransactions.map((transaction) => transaction.date),
    ["2026-08-08", "2026-08-07", "2026-08-06", "2026-08-05", "2026-08-04", "2026-08-03"],
  );
  assert.equal(
    recent.recentTransactions.some((transaction) => transaction.origin === "manual"),
    true,
  );
  assert.equal(
    recent.recentTransactions.some((transaction) => transaction.date === "2026-07-31"),
    false,
  );
  assert.equal(
    recent.recentTransactions.some((transaction) => transaction.date === "data inválida"),
    false,
  );
  assert.deepEqual(buildDashboardAnalysis([]).recentTransactions, []);

  const manyMonths = Array.from({ length: 14 }, (_, index) => {
    const cursor = new Date(Date.UTC(2025, index, 28));
    return row(
      `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}-28`,
      "receita",
      10,
      "Geral",
      index % 2 ? "manual" : "imported",
    );
  });
  const series = buildDashboardAnalysis(manyMonths);
  assert.equal(series.months.length, 12);
  assert.equal(series.months[0].key, "2025-03");
  assert.equal(series.months.at(-1).key, series.period.endDate.slice(0, 7));

  const exactlyTwelve = Array.from({ length: 12 }, (_, index) => {
    const cursor = new Date(Date.UTC(2026, index, 15));
    return row(
      `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}-15`,
      index % 2 ? "despesa" : "receita",
      index + 1,
    );
  });
  const twelveSeries = buildDashboardAnalysis(exactlyTwelve);
  assert.equal(twelveSeries.months.length, 12);
  assert.equal(twelveSeries.months[0].key, "2026-01");
  assert.equal(twelveSeries.months.at(-1).key, "2026-12");

  const yearGap = buildDashboardAnalysis([
    row("2026-11-10", "receita", 100),
    row("2027-01-10", "despesa", 50),
  ]);
  assert.deepEqual(
    yearGap.months.map((month) => [month.key, month.hasActivity]),
    [
      ["2026-11", true],
      ["2026-12", false],
      ["2027-01", true],
    ],
  );

  const summaryInvalid = buildDashboardAnalysis([
    row("2026-07-31", "receita", 9000),
    row("2026-08-10", "receita", 200),
    row("2026-08-11", "receita", 500),
    row("2026-08-12", "despesa", 300),
    row("data inválida", "despesa", 9999),
  ]);
  assert.equal(summaryInvalid.periodSummary.largestRevenue.amount, 500);
  assert.equal(summaryInvalid.periodSummary.largestExpense.amount, 300);
  assert.equal(summaryInvalid.periodSummary.revenueCount, 2);
  assert.equal(summaryInvalid.periodSummary.expenseCount, 1);
  assert.equal(summaryInvalid.invalidDateCount, 1);

  const timezone = buildDashboardAnalysis([row("2026-08-01", "receita", 100)]);
  assert.equal(timezone.period.startDate, "2026-08-01");
  assert.equal(timezone.period.endDate, "2026-08-01");

  console.log("Dashboard verification passed.");
} finally {
  await vite.close();
}
