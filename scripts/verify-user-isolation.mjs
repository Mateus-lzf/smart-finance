import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    values,
  };
}

function stateFor(owner, amount) {
  const projectId = `project-${owner}`;
  return {
    projects: [
      {
        id: projectId,
        name: `Projeto ${owner}`,
        createdAt: "2026-08-22T00:00:00.000Z",
        updatedAt: "2026-08-22T00:00:00.000Z",
      },
    ],
    activeProjectId: projectId,
    transactionsByProject: {
      [projectId]: [
        {
          id: `transaction-${owner}`,
          date: "2026-08-22",
          description: `Lançamento ${owner}`,
          category: "Teste",
          type: "receita",
          amount,
          origin: "manual",
        },
      ],
    },
    importProfilesByProject: {},
    visibleColumnsByProject: { [projectId]: ["date", "description", "amount"] },
    analyticDimensionsByProject: {},
  };
}

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const localState = await vite.ssrLoadModule("/src/lib/local-state-service.ts");
  const storage = createStorage();
  const userA = "70000000-0000-0000-0000-000000000001";
  const userB = "70000000-0000-0000-0000-000000000002";
  const stateA = stateFor("A", 500);
  const stateB = stateFor("B", 200);
  const keyA = localState.getUserLocalStateKey(userA);
  const keyB = localState.getUserLocalStateKey(userB);

  assert.notEqual(keyA, keyB, "each authenticated user receives a distinct storage key");
  localState.persistLocalState(storage, stateA, keyA);
  assert.equal(
    localState.loadUserLocalState(storage, userB),
    null,
    "user B does not hydrate user A state in the same browser",
  );
  localState.persistLocalState(storage, stateB, keyB);

  const reloadedA = localState.loadUserLocalState(storage, userA);
  const reloadedB = localState.loadUserLocalState(storage, userB);
  assert.equal(reloadedA.projects[0].name, "Projeto A");
  assert.equal(reloadedA.activeProjectId, "project-A");
  assert.equal(reloadedA.transactionsByProject["project-A"][0].amount, 500);
  assert.equal(reloadedB.projects[0].name, "Projeto B");
  assert.equal(reloadedB.activeProjectId, "project-B");
  assert.equal(reloadedB.transactionsByProject["project-B"][0].amount, 200);

  for (const userId of [userA, userB, userA, userB, userA]) {
    const expectedProject = userId === userA ? "project-A" : "project-B";
    assert.equal(
      localState.loadUserLocalState(storage, userId).activeProjectId,
      expectedProject,
      "rapid account changes never reuse the other user's active project",
    );
  }

  localState.persistLocalState(storage, stateA);
  assert.equal(
    localState.loadUserLocalState(storage, userA).projects[0].name,
    "Projeto A",
    "a scoped state is not replaced by the legacy global key",
  );
  const freshStorage = createStorage();
  localState.persistLocalState(freshStorage, stateA);
  assert.equal(
    localState.loadUserLocalState(freshStorage, userB),
    null,
    "unscoped legacy data is preserved but never assigned silently to a user",
  );
  assert.ok(
    freshStorage.getItem(localState.LOCAL_STATE_KEY),
    "legacy data remains available for a future explicit migration",
  );

  const [
    routeSource,
    appStoreSource,
    localRepositorySource,
    projectFunctions,
    projectStore,
    transactionFunctions,
    transactionStore,
    importFunctions,
    importStore,
  ] = await Promise.all([
    readFile("src/routes/_authenticated.tsx", "utf8"),
    readFile("src/lib/app-store.tsx", "utf8"),
    readFile("src/lib/local-financial-repository.ts", "utf8"),
    readFile("src/lib/projects/project-functions.ts", "utf8"),
    readFile("src/lib/projects/supabase-project-store.ts", "utf8"),
    readFile("src/lib/transactions/transaction-functions.ts", "utf8"),
    readFile("src/lib/transactions/supabase-transaction-store.ts", "utf8"),
    readFile("src/lib/imports/import-functions.ts", "utf8"),
    readFile("src/lib/imports/supabase-import-store.ts", "utf8"),
  ]);
  assert.match(routeSource, /userId=\{user\.id\}/, "the validated auth user scopes AppProvider");
  assert.match(routeSource, /key=\{user\.id\}/, "account changes reset the financial provider");
  assert.doesNotMatch(
    appStoreSource,
    /localStorage|getUserLocalStateKey|persistLocalState/,
    "AppProvider depends on the repository instead of local persistence details",
  );
  assert.match(appStoreSource, /createLocalFinancialRepository\(userId\)/);
  assert.match(localRepositorySource, /getUserLocalStateKey\(userId\)/);
  assert.doesNotMatch(
    appStoreSource,
    /project-functions|transaction-functions|import-functions|RemoteProjectRepository|RemoteTransactionRepository|RemoteImportRepository|\.from\(["'](?:projects|transactions|import_profiles|import_runs)["']\)/,
    "the financial UI does not read remote financial infrastructure",
  );
  assert.match(projectFunctions, /context\.user\.id/);
  assert.doesNotMatch(projectFunctions, /owner_user_id/);
  assert.match(projectStore, /owner_user_id: ownerUserId/);
  assert.match(transactionFunctions, /context\.user\.id/);
  assert.doesNotMatch(transactionFunctions, /owner_user_id|import_run_id|manually_modified/);
  assert.doesNotMatch(transactionStore, /owner_user_id\s*:/);
  assert.match(transactionStore, /create_financial_transaction/);
  assert.match(importFunctions, /context\.user\.id/);
  assert.doesNotMatch(importFunctions, /owner_user_id/);
  assert.doesNotMatch(importStore, /owner_user_id\s*:/);
  assert.doesNotMatch(
    `${projectFunctions}\n${projectStore}\n${transactionFunctions}\n${transactionStore}\n${importFunctions}\n${importStore}`,
    /service_role|sb_secret_|SUPABASE_SERVICE/,
  );

  console.log("Isolamento local por usuário, refresh e troca de conta: OK");
  console.log("Estado legado global preservado sem atribuição silenciosa: OK");
  console.log(
    "UI financeira permanece desconectada de Projects, Transactions e Imports remotos: OK",
  );
} finally {
  await vite.close();
}
