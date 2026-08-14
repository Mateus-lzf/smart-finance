import assert from "node:assert/strict";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const service = await vite.ssrLoadModule("/src/lib/report-service.ts");
  let id = 0;
  const row = (date, type, amount, category = "Geral", extras) => ({
    id: `report-${id++}`,
    date,
    type,
    amount,
    category,
    description: `Lançamento ${id}`,
    ...(extras ? { additionalData: extras } : {}),
  });
  const columns = [
    { id: "branch", header: "Filial", index: 5 },
    { id: "extra", header: "Extra", index: 6 },
  ];
  const baseFilters = {
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    type: "all",
    categories: [],
    dimensionValueKeys: [],
    grouping: { type: "category" },
  };
  const build = (rows, patch = {}) =>
    service.buildFinancialReport(rows, { ...baseFilters, ...patch }, { columns });

  const empty = build([]);
  assert.equal(empty.summary.transactionCount, 0);
  assert.equal(empty.summary.margin, null);

  const rows = [
    row("2025-12-31", "receita", 50, "Antiga"),
    row("2026-01-01", "receita", -1000, "Vendas", { branch: "Fortaleza", extra: true }),
    row("2026-01-15", "despesa", -200, "Operação", { branch: "Fortaleza", extra: 42 }),
    row("2026-02-28", "despesa", 300, "", { branch: "Recife", extra: "01/08/2026" }),
    row("2026-12-31", "receita", 500, "Vendas", { branch: null, extra: "texto" }),
    row("2027-01-01", "despesa", 99, "Futura"),
    row("data-inválida", "despesa", 999, "Inválida"),
  ];
  const report = build(rows);
  assert.equal(report.summary.revenue, 1500);
  assert.equal(report.summary.expenses, 500);
  assert.equal(report.summary.result, 1000);
  assert.equal(report.summary.margin, (1000 / 1500) * 100);
  assert.equal(report.summary.transactionCount, 4);
  assert.equal(report.invalidDateCount, 1);
  assert.deepEqual(
    report.transactions.map((item) => item.date),
    ["2026-01-01", "2026-01-15", "2026-02-28", "2026-12-31"],
  );

  const inclusive = build(rows, { startDate: "2026-01-01", endDate: "2026-01-01" });
  assert.equal(inclusive.summary.revenue, 1000);
  const noResults = build(rows, { startDate: "2026-06-01", endDate: "2026-06-30" });
  assert.equal(noResults.transactions.length, 0);
  assert.equal(build(rows, { startDate: "2026-12-31", endDate: "2026-01-01" }).invalidRange, true);
  assert.equal(build(rows, { type: "receita" }).summary.expenses, 0);
  assert.equal(build(rows, { type: "despesa" }).summary.revenue, 0);
  assert.equal(build(rows, { type: "despesa" }).summary.margin, null);

  assert.equal(build(rows, { categories: ["Vendas"] }).transactions.length, 2);
  assert.equal(build(rows, { categories: ["Vendas", "Operação"] }).transactions.length, 3);
  assert.equal(build(rows, { categories: [service.EMPTY_CATEGORY] }).transactions.length, 1);

  const monthGroups = build(rows, { grouping: { type: "month" } });
  assert.deepEqual(monthGroups.groups.map((group) => group.key).sort(), [
    "2026-01",
    "2026-02",
    "2026-12",
  ]);
  assert.ok(monthGroups.months.some((month) => month.label === "dez/2026"));
  const inactiveMarch = monthGroups.months.find((month) => month.key === "2026-03");
  assert.equal(inactiveMarch.hasActivity, false);
  assert.equal(inactiveMarch.result, null);
  const boundary = service.buildFinancialReport(rows, {
    ...baseFilters,
    startDate: "2025-12-01",
    endDate: "2026-01-31",
    grouping: { type: "month" },
  });
  assert.deepEqual(
    boundary.months.map((month) => month.label),
    ["dez/2025", "jan/2026"],
  );

  const dimension = build(rows, { grouping: { type: "dimension", columnId: "branch" } });
  assert.ok(dimension.groups.some((group) => group.label === "Não informado"));
  assert.equal(dimension.dimensionCoverage.informed, 3);
  assert.equal(dimension.dimensionCoverage.total, 4);
  const fortalezaKey = service.reportDimensionValueKey("Fortaleza");
  const filteredDimension = build(rows, {
    dimensionColumnId: "branch",
    dimensionValueKeys: [fortalezaKey],
  });
  assert.equal(filteredDimension.transactions.length, 2);
  assert.deepEqual(
    service.getReportDimensionValues(rows, "extra").map((item) => item.label),
    ["01/08/2026", "42", "Não informado", "Sim", "texto"].sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    ),
  );

  const legacy = build([row("2026-03-01", "receita", 10)], {
    grouping: { type: "dimension", columnId: "missing" },
  });
  assert.equal(legacy.filters.grouping.type, "category");
  assert.equal(legacy.summary.revenue, 10);
  const groupedTotals = report.groups.reduce(
    (acc, group) => ({
      revenue: acc.revenue + group.revenue,
      expenses: acc.expenses + group.expenses,
      participation: acc.participation + group.participation,
    }),
    { revenue: 0, expenses: 0, participation: 0 },
  );
  assert.equal(groupedTotals.revenue, report.summary.revenue);
  assert.equal(groupedTotals.expenses, report.summary.expenses);
  assert.ok(Math.abs(groupedTotals.participation - 100) < 0.001);

  const updated = build([...rows, row("2026-04-01", "receita", 250, "Vendas")]);
  assert.equal(updated.summary.revenue, report.summary.revenue + 250);
  const large = Array.from({ length: 5000 }, (_, index) =>
    row(
      `2026-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`,
      index % 2 ? "receita" : "despesa",
      index + 1,
    ),
  );
  assert.equal(build(large).transactions.length, 5000);

  const dateOnly = build([row("2026-08-01", "receita", 1)], {
    startDate: "2026-08-01",
    endDate: "2026-08-01",
  });
  assert.equal(dateOnly.transactions[0].date, "2026-08-01");
  assert.equal(service.getLatestMonthRange(rows).startDate, "2027-01-01");
  assert.equal(service.getLastTwelveMonthsRange(rows).startDate, "2026-02-01");

  console.log("Relatórios, filtros, agrupamentos, dimensões e datas: OK");
} finally {
  await vite.close();
}
