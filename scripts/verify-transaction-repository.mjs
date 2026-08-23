import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const mapper = await vite.ssrLoadModule("/src/lib/transactions/transaction-mapper.ts");
  const repositoryModule = await vite.ssrLoadModule(
    "/src/lib/transactions/remote-transaction-repository.ts",
  );
  const contract = await vite.ssrLoadModule("/src/lib/transactions/transaction-repository.ts");
  const row = {
    id: "92000000-0000-0000-0000-000000000001",
    project_id: "91000000-0000-0000-0000-000000000001",
    owner_user_id: "90000000-0000-0000-0000-000000000001",
    date: "2026-08-01",
    description: "Venda",
    category: "Comercial",
    type: "receita",
    amount: 1234.56,
    origin: "imported",
    manually_modified: true,
    additional_data: {
      filial: "Fortaleza",
      quantidade: 2,
      ativo: true,
      vazio: null,
      competencia: "2026-08-01",
    },
    import_run_id: "93000000-0000-0000-0000-000000000001",
    version: 4,
    created_at: "2026-08-22T10:00:00.000Z",
    updated_at: "2026-08-22T11:00:00.000Z",
  };
  const versioned = mapper.mapTransactionRow(row);
  assert.deepEqual(versioned, {
    transaction: {
      id: row.id,
      date: "2026-08-01",
      description: "Venda",
      category: "Comercial",
      type: "receita",
      amount: 1234.56,
      origin: "imported",
      manuallyModified: true,
      additionalData: row.additional_data,
    },
    projectId: row.project_id,
    importRunId: row.import_run_id,
    version: 4,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  assert.equal(mapper.isSafeFinancialAmount(1234.56), true);
  assert.equal(mapper.isSafeFinancialAmount(19.99), true);
  assert.equal(mapper.isSafeFinancialAmount(1234.567), false);
  assert.equal(mapper.isSafeFinancialAmount(-10), false);
  assert.equal(mapper.isSafeFinancialAmount(Number.NaN), false);
  assert.deepEqual(
    mapper.transactionCreateInputToPersistence({
      date: "2026-08-01",
      description: "  Venda  ",
      category: "  Comercial ",
      type: "receita",
      amount: 1234.56,
      origin: "manual",
      additionalData: { filial: "Fortaleza" },
    }),
    {
      date: "2026-08-01",
      description: "Venda",
      category: "Comercial",
      type: "receita",
      amount: 1234.56,
      origin: "manual",
      manually_modified: false,
      additional_data: { filial: "Fortaleza" },
    },
  );

  const calls = [];
  const gateway = {
    list: async (data) => {
      calls.push(["list", data]);
      return { ok: true, data: [versioned] };
    },
    get: async (data) => {
      calls.push(["get", data]);
      return { ok: true, data: versioned };
    },
    create: async (data) => {
      calls.push(["create", data]);
      return { ok: true, data: versioned };
    },
    update: async (data) => {
      calls.push(["update", data]);
      return { ok: true, data: { ...versioned, version: data.expectedVersion + 1 } };
    },
    delete: async (data) => {
      calls.push(["delete", data]);
      return { ok: true, data: null };
    },
  };
  const repository = new repositoryModule.RemoteTransactionRepository(gateway);
  assert.deepEqual(await repository.listTransactions(row.project_id), [versioned]);
  assert.deepEqual(await repository.getTransaction(row.project_id, row.id), versioned);
  const createInput = {
    date: row.date,
    description: row.description,
    category: row.category,
    type: row.type,
    amount: row.amount,
    origin: row.origin,
    additionalData: row.additional_data,
  };
  await repository.createTransaction(row.project_id, createInput);
  assert.equal(
    (
      await repository.updateTransaction(row.project_id, row.id, 4, {
        description: "Alterada",
      })
    ).version,
    5,
  );
  await repository.deleteTransaction(row.project_id, row.id, 5);
  assert.deepEqual(calls, [
    ["list", { projectId: row.project_id }],
    ["get", { projectId: row.project_id, transactionId: row.id }],
    ["create", { projectId: row.project_id, input: createInput }],
    [
      "update",
      {
        projectId: row.project_id,
        transactionId: row.id,
        expectedVersion: 4,
        input: { description: "Alterada" },
      },
    ],
    ["delete", { projectId: row.project_id, transactionId: row.id, expectedVersion: 5 }],
  ]);
  assert.equal(JSON.stringify(calls).includes("owner_user_id"), false);

  for (const [remoteCode, expectedCode] of [
    ["project_not_found", "PROJECT_NOT_FOUND"],
    ["transaction_not_found", "TRANSACTION_NOT_FOUND"],
    ["conflict", "TRANSACTION_CONFLICT"],
    ["unavailable", "TRANSACTION_UNAVAILABLE"],
  ]) {
    const failing = new repositoryModule.RemoteTransactionRepository({
      ...gateway,
      list: async () => ({ ok: false, code: remoteCode }),
    });
    await assert.rejects(
      failing.listTransactions(row.project_id),
      (error) =>
        error instanceof contract.TransactionRepositoryError && error.code === expectedCode,
    );
  }

  const [appStoreSource, functionsSource, storeSource, remoteSource] = await Promise.all([
    readFile("src/lib/app-store.tsx", "utf8"),
    readFile("src/lib/transactions/transaction-functions.ts", "utf8"),
    readFile("src/lib/transactions/supabase-transaction-store.ts", "utf8"),
    readFile("src/lib/transactions/remote-transaction-repository.ts", "utf8"),
  ]);
  assert.match(appStoreSource, /createLocalFinancialRepository\(userId\)/);
  assert.doesNotMatch(appStoreSource, /RemoteTransactionRepository|transaction-functions/);
  assert.match(functionsSource, /context\.user\.id/);
  assert.doesNotMatch(functionsSource, /owner_user_id|import_run_id|manually_modified/);
  assert.match(storeSource, /owner_user_id: ownerUserId/);
  assert.match(storeSource, /project_id: projectId/);
  assert.match(storeSource, /current\.origin === "imported"/);
  assert.match(storeSource, /\.eq\("version", expectedVersion\)/);
  assert.match(storeSource, /version: expectedVersion \+ 1/);
  assert.doesNotMatch(
    [functionsSource, storeSource, remoteSource].join("\n"),
    /service[_-]?role|sb_secret_|admin[_-]?key|database[_-]?password/i,
  );

  console.log("Transaction mapper, date-only, centavos e additionalData: OK");
  console.log("Contrato remoto versionado e erros tipados: OK");
  console.log("AppStore permanece local; ownership e metadados ficam no servidor: OK");
} finally {
  await vite.close();
}
