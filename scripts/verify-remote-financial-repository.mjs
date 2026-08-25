import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const remoteModule = await vite.ssrLoadModule("/src/lib/remote-financial-repository.ts");
  const financial = await vite.ssrLoadModule("/src/lib/financial-repository.ts");
  const projectsContract = await vite.ssrLoadModule("/src/lib/projects/project-repository.ts");
  const transactionsContract = await vite.ssrLoadModule(
    "/src/lib/transactions/transaction-repository.ts",
  );
  const preferencesContract = await vite.ssrLoadModule(
    "/src/lib/preferences/project-preferences-repository.ts",
  );

  const timestamps = { createdAt: "2026-08-24T10:00:00Z", updatedAt: "2026-08-24T10:00:00Z" };
  const profile = {
    headers: ["Data", "Descrição", "Categoria", "Tipo", "Valor", "Filial"],
    columns: [
      { id: "date", header: "Data", index: 0 },
      { id: "description", header: "Descrição", index: 1 },
      { id: "category", header: "Categoria", index: 2 },
      { id: "type", header: "Tipo", index: 3 },
      { id: "amount", header: "Valor", index: 4 },
      { id: "branch", header: "Filial", index: 5 },
    ],
    mapping: {
      date: "date",
      description: "description",
      category: "category",
      type: "type",
      amount: "amount",
    },
  };

  function emptySnapshot() {
    return {
      projects: [],
      transactionsByProject: {},
      importProfilesByProject: {},
      preferencesByProject: {},
    };
  }

  function createHarness(ownerPrefix) {
    let projectSequence = 0;
    let transactionSequence = 0;
    let snapshot = emptySnapshot();
    const calls = [];
    const importResults = new Map();
    const findProject = (id) => snapshot.projects.find((item) => item.project.id === id);
    const bumpProject = (id) => {
      findProject(id).version += 1;
    };
    const dependencies = {
      workspace: { loadWorkspaceSnapshot: async () => structuredClone(snapshot) },
      projects: {
        listProjects: async () => structuredClone(snapshot.projects),
        getProject: async (id) => structuredClone(findProject(id) ?? null),
        createProject: async (input) => {
          const id = `${ownerPrefix}-project-${++projectSequence}`;
          const created = { project: { id, name: input.name, ...timestamps }, version: 1 };
          snapshot.projects.push(created);
          snapshot.transactionsByProject[id] = [];
          snapshot.preferencesByProject[id] = preferencesContract.defaultProjectPreferences();
          return structuredClone(created);
        },
        updateProject: async (id, expectedVersion, input) => {
          const current = findProject(id);
          if (!current)
            throw new projectsContract.ProjectRepositoryError("PROJECT_NOT_FOUND", "missing");
          if (current.version !== expectedVersion)
            throw new projectsContract.ProjectRepositoryError("PROJECT_CONFLICT", "conflict");
          current.project = { ...current.project, ...input, updatedAt: timestamps.updatedAt };
          current.version += 1;
          return structuredClone(current);
        },
        deleteProject: async (id, expectedVersion) => {
          const current = findProject(id);
          if (!current)
            throw new projectsContract.ProjectRepositoryError("PROJECT_NOT_FOUND", "missing");
          if (current.version !== expectedVersion)
            throw new projectsContract.ProjectRepositoryError("PROJECT_CONFLICT", "conflict");
          snapshot.projects = snapshot.projects.filter((item) => item.project.id !== id);
          delete snapshot.transactionsByProject[id];
          delete snapshot.importProfilesByProject[id];
          delete snapshot.preferencesByProject[id];
        },
      },
      transactions: {
        listTransactions: async (projectId) =>
          structuredClone(snapshot.transactionsByProject[projectId] ?? []),
        getTransaction: async (projectId, id) =>
          structuredClone(
            snapshot.transactionsByProject[projectId]?.find((item) => item.transaction.id === id) ??
              null,
          ),
        createTransaction: async (projectId, input) => {
          calls.push(["transaction-create", projectId]);
          if (!findProject(projectId))
            throw new transactionsContract.TransactionRepositoryError(
              "PROJECT_NOT_FOUND",
              "missing",
            );
          const id = `${ownerPrefix}-transaction-${++transactionSequence}`;
          const created = {
            transaction: { id, ...input },
            projectId,
            importRunId: null,
            version: 1,
            ...timestamps,
          };
          snapshot.transactionsByProject[projectId].push(created);
          bumpProject(projectId);
          return structuredClone(created);
        },
        updateTransaction: async (projectId, id, expectedVersion, input) => {
          const current = snapshot.transactionsByProject[projectId]?.find(
            (item) => item.transaction.id === id,
          );
          if (!current)
            throw new transactionsContract.TransactionRepositoryError(
              "TRANSACTION_NOT_FOUND",
              "missing",
            );
          if (current.version !== expectedVersion)
            throw new transactionsContract.TransactionRepositoryError(
              "TRANSACTION_CONFLICT",
              "conflict",
            );
          current.transaction = {
            ...current.transaction,
            ...input,
            manuallyModified:
              current.transaction.origin === "imported" || current.transaction.manuallyModified,
          };
          current.version += 1;
          bumpProject(projectId);
          return structuredClone(current);
        },
        deleteTransaction: async (projectId, id, expectedVersion) => {
          const rows = snapshot.transactionsByProject[projectId] ?? [];
          const current = rows.find((item) => item.transaction.id === id);
          if (!current)
            throw new transactionsContract.TransactionRepositoryError(
              "TRANSACTION_NOT_FOUND",
              "missing",
            );
          if (current.version !== expectedVersion)
            throw new transactionsContract.TransactionRepositoryError(
              "TRANSACTION_CONFLICT",
              "conflict",
            );
          snapshot.transactionsByProject[projectId] = rows.filter((item) => item !== current);
          bumpProject(projectId);
        },
      },
      imports: {
        prepareImportUpdate: async () => {
          throw new Error("not used by facade");
        },
        applyInitialImport: async (command) => {
          calls.push(["initial-import", command]);
          if (importResults.has(command.idempotencyKey)) {
            return {
              ...structuredClone(importResults.get(command.idempotencyKey)),
              replayed: true,
            };
          }
          const created = await dependencies.projects.createProject(command.project);
          const projectId = created.project.id;
          snapshot.transactionsByProject[projectId] = command.rows.map((row) => ({
            transaction: {
              id: `${ownerPrefix}-transaction-${++transactionSequence}`,
              ...row,
              origin: "imported",
            },
            projectId,
            importRunId: `${ownerPrefix}-run-initial`,
            version: 1,
            ...timestamps,
          }));
          snapshot.importProfilesByProject[projectId] = structuredClone(command.profile);
          const result = {
            projectId,
            projectVersion: 1,
            importRunId: `${ownerPrefix}-run-initial`,
            replayed: false,
            rowCount: command.rows.length,
            addedCount: command.rows.length,
            changedCount: 0,
            removedCount: 0,
            unchangedCount: 0,
            duplicateCount: 0,
            preservedManualCount: 0,
            manualOverwriteCount: 0,
          };
          importResults.set(command.idempotencyKey, result);
          return structuredClone(result);
        },
        applyImportUpdate: async (command) => {
          calls.push(["update-import", command]);
          if (importResults.has(command.idempotencyKey)) {
            return {
              ...structuredClone(importResults.get(command.idempotencyKey)),
              replayed: true,
            };
          }
          const currentProject = findProject(command.projectId);
          if (currentProject.version !== command.baseProjectVersion)
            throw new projectsContract.ProjectRepositoryError("PROJECT_CONFLICT", "conflict");
          const manual = snapshot.transactionsByProject[command.projectId].filter(
            ({ transaction }) => transaction.origin === "manual",
          );
          snapshot.transactionsByProject[command.projectId] = [
            ...manual,
            ...command.rows.map((row) => ({
              transaction: {
                id: `${ownerPrefix}-transaction-${++transactionSequence}`,
                ...row,
                origin: "imported",
              },
              projectId: command.projectId,
              importRunId: `${ownerPrefix}-run-update`,
              version: 1,
              ...timestamps,
            })),
          ];
          snapshot.importProfilesByProject[command.projectId] = structuredClone(command.profile);
          bumpProject(command.projectId);
          const result = {
            projectId: command.projectId,
            projectVersion: currentProject.version,
            importRunId: `${ownerPrefix}-run-update`,
            replayed: false,
            rowCount: command.rows.length,
            addedCount: command.rows.length,
            changedCount: 0,
            removedCount: 0,
            unchangedCount: 0,
            duplicateCount: 0,
            preservedManualCount: manual.length,
            manualOverwriteCount: 0,
          };
          importResults.set(command.idempotencyKey, result);
          return structuredClone(result);
        },
      },
      preferences: {
        getProjectPreferences: async (projectId) =>
          structuredClone(snapshot.preferencesByProject[projectId]),
        updateProjectPreferences: async (projectId, expectedVersion, input) => {
          const current = snapshot.preferencesByProject[projectId];
          if (current.version !== expectedVersion)
            throw new preferencesContract.ProjectPreferencesRepositoryError(
              "PREFERENCES_CONFLICT",
              "conflict",
            );
          const next = {
            preferences: structuredClone(input),
            version: (current.version ?? 0) + 1,
            exists: true,
          };
          snapshot.preferencesByProject[projectId] = next;
          return structuredClone(next);
        },
      },
    };
    return {
      repository: new remoteModule.RemoteFinancialRepository(dependencies),
      dependencies,
      calls,
      getSnapshot: () => snapshot,
    };
  }

  const a = createHarness("a");
  assert.deepEqual(await a.repository.loadWorkspace(), financial.emptyFinancialWorkspace());
  const created = await a.repository.createProject({ name: "Projeto A" });
  const projectId = created.result.id;
  assert.equal(created.workspace.projects.length, 1);
  assert.equal(created.workspace.activeProjectId, projectId);
  await a.repository.createProject({ name: "Projeto A2" });
  assert.equal((await a.repository.selectProject(projectId)).activeProjectId, projectId);
  assert.equal(
    (await a.repository.updateProject(projectId, { name: "Renomeado" })).projects[0].name,
    "Renomeado",
  );

  const manual = {
    id: "client-id-ignored",
    date: "2026-08-24",
    description: "Manual",
    category: "Teste",
    type: "receita",
    amount: 100,
    origin: "manual",
  };
  let workspace = await a.repository.createTransaction(projectId, manual);
  const remoteTransactionId = workspace.transactionsByProject[projectId][0].id;
  assert.notEqual(remoteTransactionId, manual.id);
  workspace = await a.repository.updateTransaction(projectId, remoteTransactionId, { amount: 120 });
  assert.equal(workspace.transactionsByProject[projectId][0].amount, 120);

  await a.repository.updateProjectPreferences(projectId, {
    visibleColumns: [],
    analyticDimensions: [],
  });
  workspace = await a.repository.loadWorkspace();
  assert.deepEqual(workspace.visibleColumnsByProject[projectId], []);
  assert.deepEqual(workspace.analyticDimensionsByProject[projectId], []);
  assert.equal(workspace.importProfilesByProject[projectId], undefined);

  const importCommand = {
    transactions: [
      { ...manual, id: "import-1", origin: "imported", description: "Duplicada" },
      { ...manual, id: "import-2", origin: "imported", description: "Duplicada" },
    ],
    profile,
    destination: { mode: "create-project", newProjectName: "Importado" },
    file: { originalFilename: "dados.csv", fileHash: "a".repeat(64) },
    idempotencyKey: "10000000-0000-4000-8000-000000000001",
    confirmPossibleDuplicates: true,
    confirmManualOverwrite: false,
  };
  const imported = await a.repository.importTransactions(importCommand);
  const importedProjectId = imported.result.id;
  assert.equal(imported.workspace.transactionsByProject[importedProjectId].length, 2);
  assert.equal(
    a.calls.filter(([name]) => name === "transaction-create").length,
    1,
    "import never loops through transaction CRUD",
  );
  assert.equal(a.calls.at(-1)[1].idempotencyKey, importCommand.idempotencyKey);
  assert.equal(a.calls.at(-1)[1].file.fileHash, importCommand.file.fileHash);

  await a.repository.createTransaction(importedProjectId, {
    ...manual,
    id: "manual-same",
    description: "Duplicada",
  });
  const updateCommand = {
    ...importCommand,
    transactions: [
      { ...manual, id: "import-3", origin: "imported", description: "Atualizada", amount: 200 },
    ],
    destination: { mode: "replace-project", targetProjectId: importedProjectId },
    file: { originalFilename: "dados-2.csv", fileHash: "b".repeat(64) },
    idempotencyKey: "10000000-0000-4000-8000-000000000002",
    confirmManualOverwrite: true,
  };
  workspace = (await a.repository.importTransactions(updateCommand)).workspace;
  assert.equal(
    workspace.transactionsByProject[importedProjectId].filter((row) => row.origin === "manual")
      .length,
    1,
  );
  assert.equal(a.calls.at(-1)[1].confirmManualOverwrite, true);
  const retryCommand = structuredClone(updateCommand);
  await a.repository.importTransactions(retryCommand);
  assert.equal(
    a.calls.at(-1)[1].idempotencyKey,
    updateCommand.idempotencyKey,
    "retry preserves caller idempotency key",
  );
  assert.equal(a.calls.at(-1)[0], "update-import");

  const importedRow = (await a.repository.loadWorkspace()).transactionsByProject[
    importedProjectId
  ].find((row) => row.origin === "imported");
  workspace = await a.repository.updateTransaction(importedProjectId, importedRow.id, {
    amount: 210,
  });
  assert.equal(
    workspace.transactionsByProject[importedProjectId].find((row) => row.id === importedRow.id)
      .manuallyModified,
    true,
  );
  await a.repository.deleteTransaction(importedProjectId, importedRow.id);
  assert.equal(
    (await a.repository.loadWorkspace()).transactionsByProject[importedProjectId].some(
      (row) => row.id === importedRow.id,
    ),
    false,
  );

  const stale = a.getSnapshot().projects.find(({ project }) => project.id === projectId);
  stale.version += 1;
  await assert.rejects(
    a.repository.updateProject(projectId, { name: "Conflito" }),
    (error) => error instanceof financial.FinancialRepositoryError && error.code === "CONFLICT",
  );
  await a.repository.loadWorkspace();
  const transactionForConflict = a.getSnapshot().transactionsByProject[importedProjectId][0];
  await a.repository.loadWorkspace();
  transactionForConflict.version += 1;
  await assert.rejects(
    a.repository.updateTransaction(importedProjectId, transactionForConflict.transaction.id, {
      amount: 999,
    }),
    (error) => error.code === "CONFLICT",
  );
  await a.repository.loadWorkspace();
  const preferenceForConflict = a.getSnapshot().preferencesByProject[projectId];
  await a.repository.loadWorkspace();
  preferenceForConflict.version += 1;
  await assert.rejects(
    a.repository.updateProjectPreferences(projectId, { visibleColumns: ["date"] }),
    (error) => error.code === "CONFLICT",
  );
  await a.repository.loadWorkspace();
  const importProjectForConflict = a
    .getSnapshot()
    .projects.find(({ project }) => project.id === importedProjectId);
  await a.repository.loadWorkspace();
  importProjectForConflict.version += 1;
  await assert.rejects(
    a.repository.importTransactions({
      ...updateCommand,
      idempotencyKey: "10000000-0000-4000-8000-000000000099",
    }),
    (error) => error.code === "CONFLICT",
  );
  const unavailable = new remoteModule.RemoteFinancialRepository({
    ...a.dependencies,
    workspace: {
      loadWorkspaceSnapshot: async () => {
        throw new Error("network unavailable");
      },
    },
  });
  await assert.rejects(unavailable.loadWorkspace(), (error) => error.code === "UNAVAILABLE");
  const unauthorized = new remoteModule.RemoteFinancialRepository({
    ...a.dependencies,
    workspace: {
      loadWorkspaceSnapshot: async () => {
        throw new Error("Unauthorized session");
      },
    },
  });
  await assert.rejects(unauthorized.loadWorkspace(), (error) => error.code === "UNAUTHORIZED");

  const b = createHarness("b");
  await b.repository.createProject({ name: "Projeto B" });
  assert.equal(
    (await b.repository.loadWorkspace()).projects.some((project) => project.name === "Renomeado"),
    false,
  );
  assert.equal(
    (await a.repository.loadWorkspace()).projects.some((project) => project.name === "Projeto B"),
    false,
  );

  const deleteTarget = (await a.repository.createProject({ name: "Excluir" })).result.id;
  assert.equal(
    (await a.repository.deleteProject(deleteTarget)).projects.some(
      (project) => project.id === deleteTarget,
    ),
    false,
  );

  const [source, appStore, localRepository, routeSources] = await Promise.all([
    readFile("src/lib/remote-financial-repository.ts", "utf8"),
    readFile("src/lib/app-store.tsx", "utf8"),
    readFile("src/lib/local-financial-repository.ts", "utf8"),
    Promise.all([
      readFile("src/routes/_authenticated/dashboard.tsx", "utf8"),
      readFile("src/routes/_authenticated/dados.tsx", "utf8"),
      readFile("src/routes/_authenticated/insights.tsx", "utf8"),
      readFile("src/routes/_authenticated/relatorios.tsx", "utf8"),
    ]),
  ]);
  assert.doesNotMatch(source, /localStorage|LocalFinancialRepository|local-state-service/);
  assert.match(appStore, /createFinancialRepositoryForMode/);
  assert.doesNotMatch(appStore, /createRemoteFinancialRepository|RemoteFinancialRepository/);
  assert.doesNotMatch(
    routeSources.join("\n"),
    /RemoteFinancialRepository|remote-financial-repository/,
  );
  assert.doesNotMatch(localRepository, /RemoteFinancialRepository|Supabase/);
  assert.doesNotMatch(source, /service[_-]?role|sb_secret_|admin[_-]?key/i);

  console.log("RemoteFinancialRepository: workspace, CRUD, imports, preferences e snapshots: OK");
  console.log("Conflitos, sessão, indisponibilidade, A↔B e idempotência: OK");
  console.log(
    "UI permanece local; remoto não usa localStorage nem CRUD em loop para importação: OK",
  );
} finally {
  await vite.close();
}
