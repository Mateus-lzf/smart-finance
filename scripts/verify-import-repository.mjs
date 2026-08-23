import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const contracts = await vite.ssrLoadModule("/src/lib/imports/import-repository.ts");
  const validation = await vite.ssrLoadModule("/src/lib/imports/import-validation.ts");
  const remote = await vite.ssrLoadModule("/src/lib/imports/remote-import-repository.ts");

  const profile = {
    headers: [
      "Data",
      "Descrição",
      "Categoria",
      "Tipo",
      "Valor",
      "Filial",
      "Ativo",
      "Quantidade",
      "Vazio",
    ],
    columns: [
      "data",
      "descricao",
      "categoria",
      "tipo",
      "valor",
      "filial",
      "ativo",
      "quantidade",
      "vazio",
    ].map((id, index) => ({
      id,
      header: [
        "Data",
        "Descrição",
        "Categoria",
        "Tipo",
        "Valor",
        "Filial",
        "Ativo",
        "Quantidade",
        "Vazio",
      ][index],
      index,
    })),
    mapping: {
      date: "data",
      description: "descricao",
      category: "categoria",
      type: "tipo",
      amount: "valor",
    },
  };
  const row = {
    date: "2026-08-01",
    description: "Venda",
    category: "Vendas",
    type: "receita",
    amount: 1234.56,
    additionalData: { filial: "Fortaleza", ativo: true, quantidade: 2, vazio: null },
  };
  assert.equal(validation.remoteImportRowSchema.parse(row).date, "2026-08-01");
  assert.throws(() =>
    validation.remoteImportRowSchema.parse({ ...row, date: "2026-08-01T00:00:00Z" }),
  );
  assert.throws(() => validation.remoteImportRowSchema.parse({ ...row, amount: 10.001 }));
  assert.deepEqual(validation.remoteImportProfileSchema.parse(profile).mapping, profile.mapping);
  validation.validateProfileRows(profile, [row]);
  assert.throws(() =>
    validation.remoteImportProfileSchema.parse({
      ...profile,
      mapping: { ...profile.mapping, amount: "ausente" },
    }),
  );
  assert.equal(
    validation.validateImportPayloadSize({ rows: Array.from({ length: 10 }, () => row) }),
    true,
  );
  assert.throws(() =>
    validation.validateProfileRows(profile, [{ ...row, additionalData: { desconhecida: "x" } }]),
  );
  assert.throws(() =>
    validation.remoteImportRowSchema
      .array()
      .max(contracts.REMOTE_IMPORT_MAX_ROWS)
      .parse(Array.from({ length: contracts.REMOTE_IMPORT_MAX_ROWS + 1 }, () => row)),
  );
  console.log("Validação remota: date-only, centavos, perfil, additionalData e limites: OK");

  const result = {
    projectId: "10000000-0000-0000-0000-000000000001",
    projectVersion: 2,
    importRunId: "20000000-0000-0000-0000-000000000001",
    replayed: false,
    rowCount: 1,
    addedCount: 1,
    changedCount: 0,
    removedCount: 0,
    unchangedCount: 0,
    duplicateCount: 0,
    preservedManualCount: 0,
    manualOverwriteCount: 0,
  };
  const gateway = {
    prepare: async () => ({ ok: true, data: { ...result, baseProjectVersion: 1 } }),
    initial: async () => ({ ok: true, data: result }),
    update: async () => ({ ok: false, code: "project_conflict" }),
  };
  const repository = new remote.RemoteImportRepository(gateway);
  assert.equal((await repository.applyInitialImport({})).projectVersion, 2);
  await assert.rejects(
    () => repository.applyImportUpdate({}),
    (error) =>
      error instanceof contracts.ImportRepositoryError && error.code === "PROJECT_CONFLICT",
  );
  console.log("Contrato ImportRepository e erros tipados: OK");

  const protectedSources = await Promise.all(
    [
      "src/lib/app-store.tsx",
      "src/lib/local-financial-repository.ts",
      "src/lib/financial-repository.ts",
    ].map((path) => readFile(new URL(`../${path}`, import.meta.url), "utf8")),
  );
  assert.doesNotMatch(protectedSources.join("\n"), /RemoteImportRepository|import-functions/);
  const importSources = await Promise.all(
    [
      "src/lib/imports/import-functions.ts",
      "src/lib/imports/supabase-import-store.ts",
      "src/lib/imports/remote-import-repository.ts",
    ].map((path) => readFile(new URL(`../${path}`, import.meta.url), "utf8")),
  );
  assert.doesNotMatch(
    importSources.join("\n"),
    /service[_-]?role|sb_secret_|admin[_-]?key|database[_-]?password/i,
  );
  assert.doesNotMatch(importSources.join("\n"), /owner_user_id\s*:/i);
  console.log("UI permanece local e nenhuma credencial/ownership privilegiado foi introduzido: OK");
} finally {
  await vite.close();
}
