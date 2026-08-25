import assert from "node:assert/strict";
import { createServer } from "vite";

function createStorage() {
  const values = new Map();
  let failNextWrite = false;
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      if (failNextWrite) {
        failNextWrite = false;
        throw new DOMException("quota", "QuotaExceededError");
      }
      values.set(key, value);
    },
    failNextWrite: () => {
      failNextWrite = true;
    },
    values,
  };
}

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const [{ LocalFinancialRepository }, localState, contract] = await Promise.all([
    vite.ssrLoadModule("/src/lib/local-financial-repository.ts"),
    vite.ssrLoadModule("/src/lib/local-state-service.ts"),
    vite.ssrLoadModule("/src/lib/financial-repository.ts"),
  ]);
  const storage = createStorage();
  const userA = "80000000-0000-0000-0000-000000000001";
  const userB = "80000000-0000-0000-0000-000000000002";
  const keyA = localState.getUserLocalStateKey(userA);
  const keyB = localState.getUserLocalStateKey(userB);
  const existingUser = "80000000-0000-0000-0000-000000000003";
  const existingProjectId = "existing-project";
  const existingState = {
    projects: [
      {
        id: existingProjectId,
        name: "Projeto v2 existente",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-02T00:00:00.000Z",
      },
    ],
    activeProjectId: existingProjectId,
    transactionsByProject: {
      [existingProjectId]: [
        {
          id: "IMP-existing",
          date: "2026-08-01",
          description: "Dado existente",
          category: "Teste",
          type: "despesa",
          amount: 25,
          origin: "imported",
        },
      ],
    },
    importProfilesByProject: {
      [existingProjectId]: {
        headers: ["Data", "Descrição", "Categoria", "Tipo", "Valor"],
        mapping: {
          date: "Data",
          description: "Descrição",
          category: "Categoria",
          type: "Tipo",
          amount: "Valor",
        },
      },
    },
    visibleColumnsByProject: { [existingProjectId]: ["date", "amount"] },
    analyticDimensionsByProject: { [existingProjectId]: ["column:filial:1"] },
  };
  localState.persistLocalState(
    storage,
    existingState,
    localState.getUserLocalStateKey(existingUser),
  );
  const existingHydrated = await new LocalFinancialRepository(
    existingUser,
    storage,
  ).loadWorkspace();
  assert.deepEqual(existingHydrated, existingState, "an existing v2 workspace hydrates unchanged");
  const legacy = {
    ...contract.emptyFinancialWorkspace(),
    projects: [
      {
        id: "legacy-project",
        name: "Legado sem proprietário",
        createdAt: "2026-08-22T00:00:00.000Z",
        updatedAt: "2026-08-22T00:00:00.000Z",
      },
    ],
  };
  localState.persistLocalState(storage, legacy);
  const legacyBefore = storage.getItem(localState.LOCAL_STATE_KEY);

  const repositoryA = new LocalFinancialRepository(userA, storage);
  const methodNames = [
    "loadWorkspace",
    "selectProject",
    "createProject",
    "updateProject",
    "deleteProject",
    "createTransaction",
    "updateTransaction",
    "deleteTransaction",
    "importTransactions",
    "updateProjectPreferences",
  ];
  methodNames.forEach((method) => assert.equal(typeof repositoryA[method], "function"));
  assert.deepEqual(await repositoryA.loadWorkspace(), contract.emptyFinancialWorkspace());
  assert.equal(storage.getItem(keyA), null, "load does not invent financial data");
  assert.equal(storage.getItem(localState.LOCAL_STATE_KEY), legacyBefore);

  const created = await repositoryA.createProject({
    name: "Projeto local",
    type: "Empresa",
    description: "Contrato local",
  });
  const projectId = created.result.id;
  assert.equal(created.workspace.activeProjectId, projectId);
  assert.deepEqual(
    created.workspace.visibleColumnsByProject[projectId],
    contract.DEFAULT_VISIBLE_COLUMNS,
  );
  assert.ok(storage.getItem(keyA), "the established scoped key is used");
  assert.equal(storage.getItem(keyB), null, "another user's key remains empty");

  let workspace = await repositoryA.updateProject(projectId, {
    name: "Projeto renomeado",
    type: "Empresa",
    description: "Atualizado",
  });
  assert.equal(workspace.projects[0].name, "Projeto renomeado");

  const manual = {
    id: "90000000-0000-0000-0000-000000000001",
    date: "2026-08-01",
    description: "Receita manual",
    category: "Serviços",
    type: "receita",
    amount: 500,
    origin: "manual",
  };
  workspace = await repositoryA.createTransaction(projectId, manual);
  assert.equal(workspace.transactionsByProject[projectId].length, 1);
  workspace = await repositoryA.updateTransaction(projectId, manual.id, { amount: 650 });
  assert.equal(workspace.transactionsByProject[projectId][0].amount, 650);
  workspace = await repositoryA.deleteTransaction(projectId, manual.id);
  assert.equal(workspace.transactionsByProject[projectId].length, 0);

  const imported = {
    id: "IMP-1",
    date: "2026-08-02",
    description: "Venda importada",
    category: "Vendas",
    type: "receita",
    amount: 900,
    origin: "imported",
    additionalData: { "column:filial:1": "Fortaleza", "column:ativo:1": true },
  };
  const profile = {
    headers: ["Data", "Descrição", "Categoria", "Tipo", "Valor", "Filial"],
    columns: [{ id: "column:filial:1", header: "Filial", index: 5 }],
    mapping: {
      date: "date",
      description: "description",
      category: "category",
      type: "type",
      amount: "amount",
    },
  };
  const importedMutation = await repositoryA.importTransactions({
    transactions: [imported],
    profile,
    destination: { mode: "create-project", newProjectName: "Projeto importado" },
    file: { originalFilename: "dados.csv", fileHash: "a".repeat(64) },
    idempotencyKey: "10000000-0000-4000-8000-000000000001",
    confirmPossibleDuplicates: false,
    confirmManualOverwrite: false,
  });
  const importedProjectId = importedMutation.result.id;
  assert.equal(importedMutation.workspace.transactionsByProject[importedProjectId][0].amount, 900);
  assert.deepEqual(importedMutation.workspace.importProfilesByProject[importedProjectId], profile);
  workspace = await repositoryA.updateProjectPreferences(importedProjectId, {
    visibleColumns: ["date", "amount", "column:filial:1"],
    analyticDimensions: ["column:filial:1"],
  });
  assert.deepEqual(workspace.visibleColumnsByProject[importedProjectId], [
    "date",
    "amount",
    "column:filial:1",
  ]);
  assert.deepEqual(workspace.analyticDimensionsByProject[importedProjectId], ["column:filial:1"]);

  await repositoryA.createTransaction(importedProjectId, manual);
  const updatedImported = { ...imported, amount: 950 };
  const updatedMutation = await repositoryA.importTransactions({
    transactions: [updatedImported],
    profile,
    destination: { mode: "replace-project", targetProjectId: importedProjectId },
    file: { originalFilename: "dados-2.csv", fileHash: "b".repeat(64) },
    idempotencyKey: "10000000-0000-4000-8000-000000000002",
    confirmPossibleDuplicates: false,
    confirmManualOverwrite: false,
  });
  assert.equal(updatedMutation.workspace.transactionsByProject[importedProjectId].length, 2);
  assert.equal(updatedMutation.workspace.transactionsByProject[importedProjectId][0].amount, 950);

  const refreshed = new LocalFinancialRepository(userA, storage);
  const hydrated = await refreshed.loadWorkspace();
  assert.equal(hydrated.activeProjectId, importedProjectId);
  assert.equal(hydrated.projects.length, 2);
  assert.equal(hydrated.transactionsByProject[importedProjectId].length, 2);
  assert.deepEqual(hydrated.importProfilesByProject[importedProjectId], profile);

  const beforeFailure = storage.getItem(keyA);
  storage.failNextWrite();
  await assert.rejects(
    refreshed.updateProject(importedProjectId, { name: "Não persistido" }),
    /alteração não foi aplicada/i,
  );
  assert.equal(storage.getItem(keyA), beforeFailure, "failed persistence keeps storage unchanged");
  workspace = await refreshed.updateProject(importedProjectId, { name: "Persistido" });
  assert.equal(
    workspace.projects.find((project) => project.id === importedProjectId).name,
    "Persistido",
    "failed persistence also keeps repository memory unchanged",
  );

  workspace = await refreshed.deleteProject(projectId);
  assert.equal(
    workspace.projects.some((project) => project.id === projectId),
    false,
  );
  assert.equal(workspace.transactionsByProject[projectId], undefined);
  assert.equal(storage.getItem(localState.LOCAL_STATE_KEY), legacyBefore);
  assert.equal(storage.getItem(keyB), null);
  assert.deepEqual(
    await new LocalFinancialRepository(userB, storage).loadWorkspace(),
    contract.emptyFinancialWorkspace(),
  );

  const serialized = JSON.parse(storage.getItem(keyA));
  assert.deepEqual(Object.keys(serialized).sort(), [
    "activeProjectId",
    "analyticDimensionsByProject",
    "importProfilesByProject",
    "projects",
    "transactionsByProject",
    "visibleColumnsByProject",
  ]);

  console.log("Contrato completo e CRUD do LocalFinancialRepository: OK");
  console.log("Importação, preferências, refresh e falha atômica: OK");
  console.log("Chaves scoped e formato v2 preservados; legado global intocado: OK");
} finally {
  await vite.close();
}
