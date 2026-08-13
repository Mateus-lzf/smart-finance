import assert from "node:assert/strict";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });

try {
  const { analyzeInsights } = await vite.ssrLoadModule("/src/lib/insight-service.ts");
  const localState = await vite.ssrLoadModule("/src/lib/local-state-service.ts");

  let sequence = 0;
  const row = (date, type, amount, category = "Geral", description = "Lançamento", extras) => ({
    id: `insight-${sequence++}`,
    date,
    type,
    amount,
    category,
    description,
    ...(extras ? { additionalData: extras } : {}),
  });
  const kinds = (analysis) => analysis.insights.map((item) => item.kind);
  const dimensionalInsights = (analysis) =>
    analysis.dimensionAnalyses.flatMap((item) => (item.insight ? [item.insight] : []));

  const empty = analyzeInsights([]);
  assert.equal(empty.state, "no-transactions");
  assert.deepEqual(empty.insights, []);

  const onePeriod = analyzeInsights([
    row("2026-08-02", "receita", 2000, "Vendas", "Venda A"),
    row("2026-08-03", "despesa", 500, "Operação", "Conta"),
  ]);
  assert.ok(kinds(onePeriod).includes("result"));
  assert.equal(onePeriod.state, "composition-only");
  assert.equal(onePeriod.context.hasComparablePeriod, false);
  assert.match(onePeriod.insights[0].periodLabel, /01\/08\/2026/);

  const positive = analyzeInsights([
    row("2026-08-10", "receita", 3000),
    row("2026-08-11", "despesa", 1000),
  ]);
  const positiveResult = positive.insights.find((item) => item.kind === "result");
  assert.equal(positiveResult.level, "positivo");
  assert.equal(positiveResult.metric, "R$ 2.000,00");
  assert.match(positiveResult.body, /R\$\s?3\.000,00.*R\$\s?1\.000,00.*3,0x.*R\$\s?2\.000,00/);
  const negative = analyzeInsights([
    row("2026-08-10", "receita", 1000),
    row("2026-08-11", "despesa", 3000),
  ]);
  assert.equal(negative.insights.find((item) => item.kind === "result").level, "atencao");

  const onlyRevenue = analyzeInsights([row("2026-08-10", "receita", 1000)]);
  assert.match(onlyRevenue.insights[0].body, /nenhuma despesa/i);
  const onlyExpense = analyzeInsights([row("2026-08-10", "despesa", 1000)]);
  assert.match(onlyExpense.insights[0].body, /nenhuma receita/i);
  assert.ok(!onlyExpense.insights.some((item) => item.kind === "margin"));

  const categoryConcentration = analyzeInsights([
    row("2026-08-05", "despesa", 700, "Marketing"),
    row("2026-08-06", "despesa", 200, "Operação"),
    row("2026-08-07", "despesa", 100, "Impostos"),
  ]);
  const categoryInsight = categoryConcentration.insights.find(
    (item) => item.kind === "expense-concentration",
  );
  assert.ok(categoryInsight);
  assert.equal(Math.round(categoryInsight.evidence.share), 70);
  assert.equal(categoryInsight.level, "atencao");
  assert.equal(categoryInsight.metric, "70,0%");
  assert.match(categoryInsight.body, /R\$\s?700,00.*R\$\s?1\.000,00.*70,0%/);

  const comparable = analyzeInsights([
    row("2026-07-05", "receita", 500),
    row("2026-07-20", "receita", 500),
    row("2026-07-06", "despesa", 300, "Operação"),
    row("2026-07-21", "despesa", 300, "Marketing"),
    row("2026-08-05", "receita", 800),
    row("2026-08-20", "receita", 700),
    row("2026-08-06", "despesa", 600, "Operação"),
    row("2026-08-21", "despesa", 500, "Marketing"),
  ]);
  assert.ok(kinds(comparable).includes("revenue-change"));
  assert.ok(kinds(comparable).includes("expense-change"));
  const revenueChange = comparable.insights.find((item) => item.kind === "revenue-change");
  assert.equal(revenueChange.level, "mudanca");
  assert.match(revenueChange.body, /R\$\s?1\.000,00.*R\$\s?1\.500,00.*R\$\s?500,00.*50,0%/);

  const partial = analyzeInsights([
    row("2026-07-05", "receita", 100),
    row("2026-07-12", "receita", 100),
    row("2026-07-20", "receita", 10000),
    row("2026-08-05", "receita", 200),
    row("2026-08-12", "receita", 200),
  ]);
  const partialChange = partial.insights.find((item) => item.kind === "revenue-change");
  assert.ok(partialChange, "período parcial deve comparar a mesma quantidade de dias");
  assert.equal(partialChange.evidence.previousValue, 200);
  assert.equal(partialChange.evidence.currentValue, 400);
  assert.match(partialChange.body, /1 e 12 de julho e o mesmo período de agosto/i);

  const nonConsecutive = analyzeInsights([
    row("2026-06-05", "receita", 100),
    row("2026-06-06", "receita", 100),
    row("2026-08-05", "receita", 300),
    row("2026-08-06", "receita", 300),
  ]);
  assert.ok(!kinds(nonConsecutive).includes("revenue-change"));
  assert.equal(nonConsecutive.context.hasComparablePeriod, false);

  const yearBoundary = analyzeInsights([
    row("2025-12-05", "receita", 100),
    row("2025-12-10", "receita", 100),
    row("2026-01-05", "receita", 200),
    row("2026-01-10", "receita", 200),
  ]);
  assert.ok(kinds(yearBoundary).includes("revenue-change"));
  assert.match(
    yearBoundary.insights.find((item) => item.kind === "revenue-change").periodLabel,
    /2025.*2026/,
  );
  assert.match(
    yearBoundary.insights.find((item) => item.kind === "revenue-change").body,
    /dezembro de 2025.*janeiro de 2026/i,
  );

  const zeroBase = analyzeInsights([
    row("2026-07-05", "despesa", 100),
    row("2026-07-10", "despesa", 100),
    row("2026-08-05", "receita", 500),
    row("2026-08-10", "receita", 500),
  ]);
  assert.ok(!kinds(zeroBase).includes("revenue-change"));
  const tooFew = analyzeInsights([
    row("2026-07-05", "receita", 100),
    row("2026-08-05", "receita", 500),
  ]);
  assert.ok(!kinds(tooFew).includes("revenue-change"));

  const driver = analyzeInsights([
    row("2026-07-05", "despesa", 100, "Marketing"),
    row("2026-07-08", "despesa", 100, "Operação"),
    row("2026-08-05", "despesa", 500, "Marketing"),
    row("2026-08-08", "despesa", 120, "Operação"),
  ]);
  assert.ok(kinds(driver).includes("expense-change-driver"));

  const normalExpenses = Array.from({ length: 8 }, (_, index) =>
    row(`2026-08-${String(index + 1).padStart(2, "0")}`, "despesa", 100 + index * 2),
  );
  assert.ok(!kinds(analyzeInsights(normalExpenses)).includes("outlier"));
  const withOutlier = [...normalExpenses.slice(0, 7), row("2026-08-08", "despesa", 4800)];
  const outlier = analyzeInsights(withOutlier).insights.find((item) => item.kind === "outlier");
  assert.ok(outlier);
  assert.match(outlier.body, /revisão/i);
  assert.match(outlier.body, /valor típico/i);

  const duplicatePhenomenon = analyzeInsights([
    row("2026-08-01", "receita", 1000),
    row("2026-08-02", "despesa", 2000),
  ]);
  assert.equal(
    duplicatePhenomenon.insights.filter((item) => item.redundancyGroup === "period-result").length,
    1,
  );

  const dimensionRows = [
    row("2026-08-01", "receita", 600, "Vendas", "A", { branch: "Fortaleza" }),
    row("2026-08-02", "receita", 300, "Vendas", "B", { branch: "Fortaleza" }),
    row("2026-08-03", "receita", 100, "Vendas", "C", { branch: "Recife" }),
    row("2026-08-04", "despesa", 50, "Operação", "D", { branch: null }),
  ];
  const dimensionState = {
    projects: [{ id: "project-1", name: "Projeto", createdAt: "x", updatedAt: "x" }],
    activeProjectId: "project-1",
    transactionsByProject: { "project-1": dimensionRows },
    importProfilesByProject: {},
    visibleColumnsByProject: {},
    analyticDimensionsByProject: { "project-1": ["branch"] },
  };
  const reloadedDimensions = localState.parseLocalState(
    localState.serializeLocalState(dimensionState),
  );
  assert.deepEqual(reloadedDimensions.analyticDimensionsByProject["project-1"], ["branch"]);
  assert.equal(
    "project-1" in
      localState.deleteProjectFromLocalState(dimensionState, "project-1")
        .analyticDimensionsByProject,
    false,
  );
  const dimensionColumn = { id: "branch", header: "Filial", index: 5 };
  assert.ok(
    !kinds(analyzeInsights(dimensionRows, { columns: [dimensionColumn] })).includes(
      "dimension-concentration",
    ),
    "dimensão não selecionada não deve gerar insight",
  );
  const selectedDimension = analyzeInsights(dimensionRows, {
    columns: [dimensionColumn],
    selectedDimensionIds: ["branch"],
  });
  const dimensionInsight = dimensionalInsights(selectedDimension)[0];
  assert.ok(dimensionInsight);
  assert.equal(dimensionInsight.evidence.coverage, 75);
  assert.match(
    dimensionInsight.body,
    /concentrou 90,0% das receitas entre os lançamentos que têm Filial informado\./,
  );
  assert.match(dimensionInsight.body, /informação de Filial está preenchida em 75,0%/);
  assert.doesNotMatch(dimensionInsight.body, /dos receitas|dos despesas/);

  const semanticRows = [
    row("2026-08-01", "receita", 700, "Vendas", "A", {
      seller: "Carlos",
      customer: "Loja A",
      cost: "Comercial",
    }),
    row("2026-08-02", "receita", 200, "Vendas", "B", {
      seller: "Carlos",
      customer: "Loja A",
      cost: "Comercial",
    }),
    row("2026-08-03", "receita", 100, "Vendas", "C", {
      seller: "Ana",
      customer: "Loja B",
      cost: "Operação",
    }),
    row("2026-08-04", "despesa", 900, "Operação", "D", {
      seller: "Ana",
      customer: "Loja B",
      cost: "Operação",
    }),
    row("2026-08-05", "despesa", 100, "Operação", "E", {
      seller: "Ana",
      customer: "Loja B",
      cost: "Comercial",
    }),
  ];
  const semanticColumns = [
    { id: "seller", header: "Vendedor", index: 5 },
    { id: "customer", header: "Cliente", index: 6 },
    { id: "cost", header: "Centro de custo", index: 7 },
  ];
  const sellerInsight = analyzeInsights(semanticRows, {
    columns: semanticColumns,
    selectedDimensionIds: ["seller"],
  }).dimensionAnalyses[0].insight;
  assert.match(sellerInsight.body, /concentrou 90,0% das receitas do período/);
  assert.ok(!sellerInsight.body.includes("despesas"));
  const customerInsight = analyzeInsights(semanticRows, {
    columns: semanticColumns,
    selectedDimensionIds: ["customer"],
  }).dimensionAnalyses[0].insight;
  assert.match(customerInsight.body, /das receitas do período/);
  const costInsight = analyzeInsights(semanticRows, {
    columns: semanticColumns,
    selectedDimensionIds: ["cost"],
  }).dimensionAnalyses[0].insight;
  assert.match(costInsight.body, /concentrou 90,0% das despesas do período/);

  const completeDimension = analyzeInsights(dimensionRows.slice(0, 3), {
    columns: [dimensionColumn],
    selectedDimensionIds: ["branch"],
  }).dimensionAnalyses[0].insight;
  assert.equal(completeDimension.evidence.coverage, 100);
  assert.ok(!completeDimension.body.includes("preenchida"));
  assert.match(completeDimension.body, /das receitas do período\./);

  const paymentRows = [
    row("2026-08-01", "receita", 100, "Vendas", "A", { payment: "PIX" }),
    row("2026-08-02", "despesa", 100, "Operação", "B", { payment: "PIX" }),
    row("2026-08-03", "receita", 100, "Vendas", "C", { payment: "PIX" }),
    row("2026-08-04", "despesa", 100, "Operação", "D", { payment: "Dinheiro" }),
  ];
  const paymentColumn = { id: "payment", header: "Forma de pagamento", index: 8 };
  const paymentInsight = analyzeInsights(paymentRows, {
    columns: [paymentColumn],
    selectedDimensionIds: ["payment"],
  }).dimensionAnalyses[0].insight;
  assert.match(paymentInsight.body, /representou 75,0% dos lançamentos do período\./);
  assert.doesNotMatch(paymentInsight.body, /preenchida/);

  const lowCoverage = analyzeInsights(
    [
      ...dimensionRows,
      row("2026-08-05", "receita", 100, "Vendas", "E", { branch: null }),
      row("2026-08-06", "receita", 100, "Vendas", "F", { branch: null }),
    ],
    { columns: [dimensionColumn], selectedDimensionIds: ["branch"] },
  );
  assert.equal(lowCoverage.dimensionAnalyses[0].status, "insufficient-coverage");
  assert.match(lowCoverage.dimensionAnalyses[0].message, /apenas 50,0%/);

  const manyCandidates = analyzeInsights(
    [
      ...withOutlier,
      row("2026-08-09", "receita", 1000, "Vendas", "Contrato A"),
      row("2026-08-10", "receita", 800, "Vendas", "Contrato A"),
      row("2026-08-11", "receita", 200, "Vendas", "Contrato B"),
    ],
    { maxInsights: 6 },
  );
  assert.ok(manyCandidates.insights.length <= 6);
  assert.ok(onePeriod.insights.length < 6, "o motor não deve preencher seis cards artificialmente");
  assert.equal(
    new Set(manyCandidates.insights.map((item) => item.redundancyGroup)).size,
    manyCandidates.insights.length,
  );
  const allowedLevels = new Set(["positivo", "atencao", "informativo", "mudanca"]);
  manyCandidates.insights.forEach((item) => assert.ok(allowedLevels.has(item.level)));

  const oneAutomaticWithoutDimension = analyzeInsights(semanticRows, { maxInsights: 1 });
  const oneAutomaticWithSeller = analyzeInsights(semanticRows, {
    columns: semanticColumns,
    selectedDimensionIds: ["seller"],
    maxInsights: 1,
  });
  assert.equal(oneAutomaticWithSeller.insights.length, 1);
  assert.equal(oneAutomaticWithSeller.insights[0].id, oneAutomaticWithoutDimension.insights[0].id);
  assert.equal(oneAutomaticWithSeller.dimensionAnalyses[0].status, "available");

  const fourColumns = [
    ...semanticColumns,
    { id: "payment", header: "Forma de pagamento", index: 8 },
  ];
  const fourDimensionRows = semanticRows.map((item, index) => ({
    ...item,
    additionalData: {
      ...item.additionalData,
      payment: index < 4 ? "PIX" : "Cartão",
    },
  }));
  const cappedDimensions = analyzeInsights(fourDimensionRows, {
    columns: fourColumns,
    selectedDimensionIds: ["seller", "customer", "cost", "payment"],
  });
  assert.equal(cappedDimensions.dimensionAnalyses.length, 3);
  assert.deepEqual(
    cappedDimensions.dimensionAnalyses.map((item) => item.columnId),
    ["seller", "customer", "cost"],
  );

  const redundantRows = [
    row("2026-08-01", "receita", 1000, "Vendas", "Venda", { cost: "Comercial" }),
    row("2026-08-02", "despesa", 600, "Tecnologia", "Sistema", { cost: "Tecnologia" }),
    row("2026-08-03", "despesa", 300, "Tecnologia", "Equipamento", { cost: "Tecnologia" }),
    row("2026-08-04", "despesa", 100, "Operação", "Conta", { cost: "Operação" }),
  ];
  const automaticRedundancy = analyzeInsights(redundantRows);
  assert.ok(kinds(automaticRedundancy).includes("expense-concentration"));
  const dimensionalRedundancy = analyzeInsights(redundantRows, {
    columns: [{ id: "cost", header: "Centro de custo", index: 5 }],
    selectedDimensionIds: ["cost"],
  });
  assert.ok(!kinds(dimensionalRedundancy).includes("expense-concentration"));
  assert.equal(dimensionalRedundancy.dimensionAnalyses[0].status, "available");
  assert.equal(dimensionalRedundancy.dimensionAnalyses[0].insight.evidence.share, 90);
  assert.ok(kinds(dimensionalRedundancy).includes("result"));

  const distinctDimension = analyzeInsights(
    redundantRows.map((item, index) => ({
      ...item,
      additionalData: { branch: index < 3 ? "Fortaleza" : "Recife" },
    })),
    {
      columns: [{ id: "branch", header: "Filial", index: 5 }],
      selectedDimensionIds: ["branch"],
    },
  );
  assert.ok(kinds(distinctDimension).includes("expense-concentration"));
  assert.equal(distinctDimension.dimensionAnalyses[0].status, "available");

  const completeMonths = analyzeInsights([
    row("2026-07-01", "receita", 100),
    row("2026-07-31", "receita", 100),
    row("2026-08-01", "receita", 200),
    row("2026-08-31", "receita", 200),
  ]);
  const completeChange = completeMonths.insights.find((item) => item.kind === "revenue-change");
  assert.match(completeChange.body, /Entre julho e agosto/i);
  assert.doesNotMatch(completeChange.body, /1 e 31/);
  assert.equal(completeChange.evidence.previousValue, 200);
  assert.equal(completeChange.evidence.currentValue, 400);

  const reduction = analyzeInsights([
    row("2026-07-05", "despesa", 400),
    row("2026-07-12", "despesa", 400),
    row("2026-08-05", "despesa", 200),
    row("2026-08-12", "despesa", 200),
  ]).insights.find((item) => item.kind === "expense-change");
  assert.match(reduction.body, /redução de R\$\s?400,00 \(50,0%\)/i);
  assert.equal(reduction.evidence.absoluteChange, -400);

  const forbidden = /você deveria|invista mais|reduza|isso aconteceu porque|vai acontecer/i;
  [...positive.insights, ...comparable.insights, ...dimensionalInsights(selectedDimension)].forEach(
    (item) => assert.doesNotMatch(item.body, forbidden),
  );

  console.log("Motor de insights, períodos, relevância, dimensões e outliers: OK");
} finally {
  await vite.close();
}
