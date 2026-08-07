import assert from "node:assert/strict";
import { File } from "node:buffer";
import { zipSync, strToU8 } from "fflate";
import { createServer } from "vite";

globalThis.FileReader = class FileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(
      (result) => {
        this.result = result;
        this.onload?.();
      },
      (error) => this.onerror?.(error),
    );
  }
};

function makeXlsx() {
  const contentTypes = `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
  const rootRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbook = `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Dados" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const workbookRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const styles = `<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font/></fonts><fills count="1"><fill/></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf xfId="0"/><xf xfId="0" numFmtId="14" applyNumberFormat="1"/></cellXfs></styleSheet>`;
  const values = [
    ["date", "description", "category", "type", "amount"],
    [46235, "Serviço", "Vendas", "entrada", 3000],
    [46236, "Conta", "Fixos", "saída", 500],
  ];
  const cells = values
    .map(
      (row, rowIndex) =>
        `<row r="${rowIndex + 1}">${row
          .map((value, columnIndex) => {
            const reference = `${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`;
            return typeof value === "number"
              ? `<c r="${reference}"${columnIndex === 0 ? ' s="1"' : ""}><v>${value}</v></c>`
              : `<c r="${reference}" t="inlineStr"><is><t>${value}</t></is></c>`;
          })
          .join("")}</row>`,
    )
    .join("");
  const sheet = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${cells}</sheetData></worksheet>`;
  return zipSync({
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rootRels),
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRels),
    "xl/styles.xml": strToU8(styles),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  });
}

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const importer = await vite.ssrLoadModule("/src/lib/import-service.ts");
  const finance = await vite.ssrLoadModule("/src/lib/finance-service.ts");
  const projectService = await vite.ssrLoadModule("/src/lib/project-service.ts");
  const transactionService = await vite.ssrLoadModule("/src/lib/transaction-service.ts");
  const calendarDate = await vite.ssrLoadModule("/src/lib/calendar-date.ts");
  const updateService = await vite.ssrLoadModule("/src/lib/transaction-update-service.ts");
  const localState = await vite.ssrLoadModule("/src/lib/local-state-service.ts");
  const navigation = await vite.ssrLoadModule("/src/lib/app-navigation.ts");
  const csv = [
    "Data;Descrição;Categoria;Tipo;Valor",
    '01/07/2026;"Venda, balcão";Vendas;Receita;2.500,00',
    "02/07/2026;Aluguel;Fixos;Despesa;1.000,00",
  ].join("\n");
  const csvPreview = await importer.readImportFile(new File([csv], "dados.csv"));
  assert.deepEqual(csvPreview.missingFields, []);
  const csvRows = importer.normalizeImportedRows(csvPreview);
  assert.equal(csvRows[0].date, "2026-07-01");
  assert.equal(calendarDate.formatCalendarDate(csvRows[0].date), "01/07/2026");
  assert.equal(csvRows[0].description, "Venda, balcão");
  assert.equal(finance.kpisFromTransactions(csvRows).saldo.value, 1500);
  assert.equal(finance.parseCurrencyInput("− R$ 2.500,50"), 2500.5);
  console.log("Importação CSV: OK");

  const createdProject = projectService.createLocalProject(
    { name: "  Projeto real  ", type: " Serviços ", description: " Controle local " },
    { id: "project-1", now: "2026-08-06T00:00:00.000Z" },
  );
  assert.equal(createdProject.name, "Projeto real");
  assert.equal(createdProject.type, "Serviços");
  const renamedProject = projectService.updateLocalProject(
    createdProject,
    { name: "Projeto renomeado" },
    "2026-08-07T00:00:00.000Z",
  );
  assert.equal(renamedProject.name, "Projeto renomeado");
  assert.equal("type" in renamedProject, false);
  const secondProject = projectService.createLocalProject(
    { name: "Segundo" },
    { id: "project-2", now: "2026-08-06T00:00:00.000Z" },
  );
  const deletedProject = projectService.deleteLocalProject(
    [renamedProject, secondProject],
    { "project-1": [], "project-2": [] },
    "project-1",
    "project-1",
  );
  assert.deepEqual(
    deletedProject.projects.map((project) => project.id),
    ["project-2"],
  );
  assert.equal(deletedProject.activeProjectId, "project-2");
  assert.equal("project-1" in deletedProject.transactionsByProject, false);
  console.log("CRUD de projetos: OK");

  const unknownHeaders = await importer.readImportFile(
    new File(["Quando,Texto,Grupo,Natureza,Total\n01/07/2026,Venda,Vendas,Receita,100"], "map.csv"),
  );
  assert.deepEqual(unknownHeaders.missingFields, ["date", "description"]);

  const xlsxPreview = await importer.readImportFile(new File([makeXlsx()], "dados.xlsx"));
  assert.deepEqual(xlsxPreview.missingFields, []);
  const xlsxRows = importer.normalizeImportedRows(xlsxPreview);
  assert.equal(xlsxRows[0].date, "2026-08-01");
  assert.equal(calendarDate.formatCalendarDate(xlsxRows[0].date), "01/08/2026");
  assert.equal(calendarDate.parseCalendarDate(new Date("2026-08-01T00:00:00.000Z")), "2026-08-01");
  assert.equal(finance.kpisFromTransactions(xlsxRows).lucro.value, 2500);
  const augustSeries = finance.monthlySeriesFromTransactions(xlsxRows);
  assert.equal(augustSeries[0].month, "ago");
  assert.equal(augustSeries[0].receita, 3000);
  assert.equal(
    finance.weekdayRevenueFromTransactions(xlsxRows).find((day) => day.day === "Sáb").receita,
    3000,
  );
  console.log("Importação XLSX e regressão de datas 01/08/2026: OK");

  const edited = xlsxRows.map((row) => (row.type === "despesa" ? { ...row, amount: 1000 } : row));
  assert.equal(finance.kpisFromTransactions(edited).saldo.value, 2000);
  const added = transactionService.addLocalTransaction([], xlsxRows[0]);
  assert.equal(added.length, 1);
  const updated = transactionService.updateLocalTransaction(added, xlsxRows[0].id, {
    amount: 3500,
  });
  assert.equal(updated[0].amount, 3500);
  const deleted = transactionService.deleteLocalTransaction(updated, xlsxRows[0].id);
  assert.equal(deleted.length, 0);
  console.log("CRUD de lançamentos e recálculo financeiro: OK");

  const initial = [
    { ...csvRows[0], id: "old-1" },
    { ...csvRows[1], id: "old-2" },
  ];
  const nextCsv = [
    "Data;Descrição;Categoria;Tipo;Valor",
    '01/07/2026;"Venda, balcão";Vendas;Receita;3.000,00',
    "03/07/2026;Energia;Fixos;Despesa;250,00",
    "03/07/2026;Energia;Fixos;Despesa;250,00",
  ].join("\n");
  const nextPreview = await importer.readImportFile(new File([nextCsv], "dados-atualizados.csv"));
  const reusedMapping = updateService.reuseImportMapping(nextPreview, {
    headers: csvPreview.headers,
    mapping: csvPreview.mapping,
  });
  assert.deepEqual(reusedMapping, nextPreview.mapping);
  const nextRows = importer.normalizeImportedRows(nextPreview, reusedMapping);
  const comparison = updateService.compareTransactionUpdates(initial, nextRows);
  assert.equal(comparison.changed.length, 1, "alteração de valor deve ser identificada");
  assert.equal(comparison.changed[0].before.amount, 2500);
  assert.equal(comparison.changed[0].after.amount, 3000);
  assert.equal(comparison.added.length, 1, "nova linha deve ser identificada");
  assert.equal(comparison.removed.length, 1, "linha ausente deve ser removida");
  assert.equal(comparison.possibleDuplicates.length, 1);
  assert.equal(comparison.nextTransactions.length, 2, "duplicata não deve entrar no resultado");
  assert.equal(
    new Set(comparison.nextTransactions.map(updateService.transactionFingerprint)).size,
    2,
  );
  assert.deepEqual(
    initial.map((row) => row.amount),
    [2500, 1000],
    "comparação/cancelamento não pode mutar dados atuais",
  );
  assert.equal(finance.kpisFromTransactions(comparison.nextTransactions).saldo.value, 2750);
  console.log("Atualização, inclusão, alteração, remoção e duplicatas: OK");

  const persisted = localState.serializeLocalState({
    projects: [createdProject],
    activeProjectId: createdProject.id,
    transactionsByProject: { [createdProject.id]: comparison.nextTransactions },
    importProfilesByProject: {
      [createdProject.id]: { headers: nextPreview.headers, mapping: reusedMapping },
    },
  });
  const reloaded = localState.parseLocalState(persisted);
  assert.deepEqual(reloaded.transactionsByProject[createdProject.id], comparison.nextTransactions);
  assert.deepEqual(reloaded.importProfilesByProject[createdProject.id].mapping, reusedMapping);

  const intactBeforeInvalid = structuredClone(initial);
  await assert.rejects(
    () => importer.readImportFile(new File(["sem dados"], "invalido.txt")),
    /Formato inválido/,
  );
  assert.deepEqual(
    initial,
    intactBeforeInvalid,
    "arquivo inválido não pode alterar os dados atuais",
  );
  console.log("Persistência, cancelamento e arquivo inválido sem perda: OK");

  assert.deepEqual(
    navigation.appNavigation.map((item) => item.to),
    ["/projetos", "/dashboard", "/dados", "/insights", "/relatorios", "/configuracoes"],
  );
  console.log("Navegação móvel compartilha todas as rotas principais: OK");
} finally {
  await vite.close();
}
