import assert from "node:assert/strict";
import { createServer } from "vite";
import { strFromU8, unzipSync } from "fflate";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
const userA = "10000000-0000-4000-8000-000000000001";
const projectA = "20000000-0000-4000-8000-000000000001";
const transactionA = "30000000-0000-4000-8000-000000000001";
const runA = "40000000-0000-4000-8000-000000000001";
const createdAt = "2026-08-30T12:00:00.000Z";
const generatedAt = "2026-08-30T15:30:00.000Z";

const fixture = {
  account: {
    id: userA,
    email: "portabilidade+teste@example.com",
    emailConfirmedAt: createdAt,
    createdAt,
    updatedAt: createdAt,
    profile: { displayName: "Usuária Ç", locale: "pt-BR", createdAt, updatedAt: createdAt },
  },
  projects: [
    {
      id: projectA,
      ownerUserId: userA,
      name: '=Projeto; "Especial"',
      type: "Pessoal",
      description: "Linha 1\nLinha 2",
      version: 3,
      createdAt,
      updatedAt: createdAt,
    },
  ],
  transactions: [
    {
      id: transactionA,
      projectId: projectA,
      ownerUserId: userA,
      date: "2026-08-30",
      description: "+Fórmula não executável",
      category: "Alimentação",
      type: "despesa",
      amount: "4451.01",
      origin: "imported",
      manuallyModified: true,
      additionalData: { texto: "Olá", numero: 12.5, ativo: true, vazio: null },
      importRunId: runA,
      version: 2,
      createdAt,
      updatedAt: createdAt,
    },
  ],
  importProfiles: [
    {
      projectId: projectA,
      ownerUserId: userA,
      headers: ["Data", "Descrição", "Extra"],
      columns: [{ id: "extra", header: "Extra", index: 2 }],
      mapping: { date: "Data", description: "Descrição" },
      schemaVersion: 1,
      createdAt,
      updatedAt: createdAt,
    },
  ],
  importRuns: [
    {
      id: runA,
      projectId: projectA,
      ownerUserId: userA,
      operation: "initial",
      status: "completed",
      originalFilename: "lançamentos.csv",
      fileHash: "a".repeat(64),
      rowCount: 1,
      addedCount: 1,
      changedCount: 0,
      removedCount: 0,
      duplicateCount: 0,
      unchangedCount: 0,
      preservedManualCount: 0,
      manualOverwriteCount: 0,
      baseProjectVersion: 1,
      resultProjectVersion: 2,
      errorCode: null,
      createdAt,
      completedAt: createdAt,
    },
  ],
  projectPreferences: [
    {
      projectId: projectA,
      userId: userA,
      visibleColumns: [],
      analyticalDimensions: ["extra"],
      version: 2,
      createdAt,
      updatedAt: createdAt,
    },
  ],
};

try {
  const serializers = await vite.ssrLoadModule(
    "/src/lib/account-export/account-export-serializers.ts",
  );
  const schemas = await vite.ssrLoadModule("/src/lib/account-export/account-export-schema.ts");
  const first = serializers.createAccountExportV1Zip(fixture, generatedAt);
  const second = serializers.createAccountExportV1Zip(fixture, generatedAt);
  assert.equal(first.fileName, "smart-finance-export-v1-2026-08-30.zip");
  assert.deepEqual(first.bytes, second.bytes, "ZIP must be deterministic");

  const unzipped = unzipSync(first.bytes);
  assert.deepEqual(Object.keys(unzipped), serializers.ACCOUNT_EXPORT_V1_FILES);
  const files = Object.fromEntries(
    Object.entries(unzipped).map(([name, bytes]) => [name, strFromU8(bytes)]),
  );
  const manifest = JSON.parse(files["manifest.json"]);
  assert.equal(manifest.version, 1);
  assert.equal(manifest.generatedAt, generatedAt);
  assert.deepEqual(manifest.counts, {
    importProfiles: 1,
    importRuns: 1,
    projectPreferences: 1,
    projects: 1,
    transactions: 1,
  });
  assert.equal(JSON.parse(files["account.json"]).profile.displayName, "Usuária Ç");
  assert.match(files["projects.csv"], /'\=Projeto/);
  assert.match(files["projects.csv"], /Linha 1\nLinha 2/);
  assert.match(files["transactions.csv"], /'\+Fórmula não executável/);
  assert.match(files["transactions.csv"], /4451,01/);
  assert.match(files["transactions.csv"], /2026-08-30/);
  assert.match(files["transactions.csv"], /Alimentação/);
  const transactionLine = files["transactions.csv"].split("\r\n")[1];
  assert.ok(transactionLine);
  assert.match(
    transactionLine,
    /"\{""ativo"":true,""numero"":12\.5,""texto"":""Olá"",""vazio"":null\}"/,
  );
  assert.deepEqual(JSON.parse(files["project-preferences.json"])[0].visibleColumns, []);
  assert.deepEqual(JSON.parse(files["import-profiles.json"])[0].columns[0], {
    header: "Extra",
    id: "extra",
    index: 2,
  });

  const entirePackage = Object.values(files).join("\n");
  for (const forbidden of [
    "access_token",
    "refresh_token",
    "password_hash",
    "set-cookie",
    "sb-access-token",
    "service_role",
    "app_metadata",
    "identities",
    "idempotency_key",
    "request_hash",
  ])
    assert.doesNotMatch(entirePackage, new RegExp(forbidden, "i"));

  assert.throws(() =>
    schemas.accountExportV1Schema.parse({
      ...fixture,
      account: { ...fixture.account, access_token: "proibido" },
    }),
  );
  assert.throws(() =>
    schemas.accountExportV1Schema.parse({
      ...fixture,
      importRuns: [{ ...fixture.importRuns[0], requestHash: "b".repeat(64) }],
    }),
  );
  assert.throws(() =>
    schemas.accountExportV1Schema.parse({
      ...fixture,
      transactions: [{ ...fixture.transactions[0], amount: "4451.019" }],
    }),
  );
  assert.throws(() =>
    schemas.accountExportV1Schema.parse({
      ...fixture,
      transactions: [{ ...fixture.transactions[0], date: "2026-02-30" }],
    }),
  );

  const reordered = {
    ...fixture,
    transactions: [
      { ...fixture.transactions[0], id: "30000000-0000-4000-8000-000000000002" },
      fixture.transactions[0],
    ],
  };
  const orderedCsv = serializers.createAccountExportV1Files(reordered, generatedAt)[
    "transactions.csv"
  ];
  assert.ok(orderedCsv.indexOf(transactionA) < orderedCsv.indexOf(reordered.transactions[0].id));
  console.log("Account export v1 contract, serializers, and deterministic ZIP passed.");
} finally {
  await vite.close();
}
