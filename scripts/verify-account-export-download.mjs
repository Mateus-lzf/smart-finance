import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";
import { strFromU8, unzipSync } from "fflate";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
const userId = "10000000-0000-4000-8000-000000000001";
const otherUserId = "10000000-0000-4000-8000-000000000002";
const projectId = "20000000-0000-4000-8000-000000000001";
const transactionId = "30000000-0000-4000-8000-000000000001";
const runId = "40000000-0000-4000-8000-000000000001";
const timestamp = "2026-08-31T12:00:00.000Z";

const user = {
  id: userId,
  email: "portabilidade+download@example.com",
  email_confirmed_at: timestamp,
  created_at: timestamp,
  updated_at: timestamp,
  app_metadata: { provider: "email" },
  identities: [{ identity_id: "forbidden" }],
};

const snapshot = {
  profile: {
    display_name: "Usuária Á",
    locale: "pt-BR",
    created_at: timestamp,
    updated_at: timestamp,
  },
  projects: [
    {
      id: projectId,
      owner_user_id: userId,
      name: "Projeto exportado",
      type: "Pessoal",
      description: null,
      version: 2,
      created_at: timestamp,
      updated_at: timestamp,
    },
  ],
  transactions: [
    {
      id: transactionId,
      project_id: projectId,
      owner_user_id: userId,
      date: "2026-08-31",
      description: "+Conteúdo protegido",
      category: "Teste",
      type: "receita",
      amount: "100.00",
      origin: "imported",
      manually_modified: false,
      additional_data: { texto: "Olá", numero: 1.5, ativo: true, vazio: null },
      import_run_id: runId,
      version: 1,
      created_at: timestamp,
      updated_at: timestamp,
    },
  ],
  import_profiles: [
    {
      project_id: projectId,
      owner_user_id: userId,
      headers: ["Data", "Descrição"],
      columns: [],
      mapping: { date: "Data" },
      schema_version: 1,
      created_at: timestamp,
      updated_at: timestamp,
    },
  ],
  import_runs: [
    {
      id: runId,
      project_id: projectId,
      owner_user_id: userId,
      operation: "initial",
      status: "completed",
      original_filename: "dados.csv",
      file_hash: "a".repeat(64),
      row_count: 1,
      added_count: 1,
      changed_count: 0,
      removed_count: 0,
      duplicate_count: 0,
      unchanged_count: 0,
      preserved_manual_count: 0,
      manual_overwrite_count: 0,
      base_project_version: 1,
      result_project_version: 2,
      error_code: null,
      created_at: timestamp,
      completed_at: timestamp,
    },
  ],
  project_preferences: [
    {
      project_id: projectId,
      user_id: userId,
      visible_columns: [],
      analytical_dimensions: [],
      version: 1,
      created_at: timestamp,
      updated_at: timestamp,
    },
  ],
};

function createClient({
  authUser = user,
  authError = null,
  rpcData = snapshot,
  rpcError = null,
} = {}) {
  const rpcCalls = [];
  return {
    rpcCalls,
    client: {
      auth: {
        getUser: async () => ({ data: { user: authUser }, error: authError }),
      },
      rpc: async (...args) => {
        rpcCalls.push(args);
        return { data: rpcData, error: rpcError };
      },
    },
  };
}

function emptyFiles(names) {
  return Object.fromEntries(names.map((name) => [name, ""]));
}

async function errorCode(response) {
  return (await response.json()).error;
}

try {
  const serverModule = await vite.ssrLoadModule("/src/lib/account-export/account-export-server.ts");
  const httpModule = await vite.ssrLoadModule("/src/lib/account-export/account-export-http.ts");
  const mapperModule = await vite.ssrLoadModule("/src/lib/account-export/account-export-mapper.ts");
  const serializers = await vite.ssrLoadModule(
    "/src/lib/account-export/account-export-serializers.ts",
  );
  const originModule = await vite.ssrLoadModule("/src/lib/http/same-origin.ts");

  const successfulClient = createClient();
  const success = await serverModule.generateAccountExportDownload({
    client: successfulClient.client,
    generatedAt: timestamp,
  });
  assert.equal(success.ok, true);
  assert.deepEqual(successfulClient.rpcCalls, [["export_account_data_v1"]]);
  assert.equal(success.fileName, "smart-finance-export-v1-2026-08-31.zip");
  assert.deepEqual([...success.bytes.slice(0, 2)], [0x50, 0x4b]);

  const archive = unzipSync(success.bytes);
  const accountJson = strFromU8(archive["account.json"]);
  const transactionCsv = strFromU8(archive["transactions.csv"]);
  assert.equal(JSON.parse(accountJson).email, user.email);
  assert.match(transactionCsv, /100,00/);
  assert.match(transactionCsv, /'\+Conteúdo protegido/);
  const exportedText = Object.values(archive)
    .map((bytes) => strFromU8(bytes))
    .join("\n");
  for (const forbidden of [
    "app_metadata",
    "identities",
    "access_token",
    "refresh_token",
    "password",
    "service_role",
    "idempotency_key",
    "request_hash",
  ]) {
    assert.doesNotMatch(exportedText, new RegExp(forbidden, "i"));
  }

  assert.throws(() =>
    mapperModule.mapAccountExportV1(user, {
      ...snapshot,
      projects: [{ ...snapshot.projects[0], owner_user_id: otherUserId }],
    }),
  );
  assert.throws(() =>
    mapperModule.mapAccountExportV1(user, {
      ...snapshot,
      transactions: [{ ...snapshot.transactions[0], project_id: crypto.randomUUID() }],
    }),
  );
  assert.throws(() =>
    mapperModule.mapAccountExportV1(user, { ...snapshot, access_token: "forbidden" }),
  );

  const noSession = await serverModule.generateAccountExportDownload({
    client: createClient({ authUser: null }).client,
  });
  assert.deepEqual(noSession, { ok: false, code: "authentication_required" });
  const expiredSession = await serverModule.generateAccountExportDownload({
    client: createClient({ authUser: null, authError: { status: 401, message: "JWT expired" } })
      .client,
  });
  assert.deepEqual(expiredSession, { ok: false, code: "authentication_required" });
  const unavailableAuth = await serverModule.generateAccountExportDownload({
    client: createClient({ authUser: null, authError: { status: 0, name: "FetchError" } }).client,
  });
  assert.deepEqual(unavailableAuth, { ok: false, code: "unavailable" });
  const deniedRpc = await serverModule.generateAccountExportDownload({
    client: createClient({ rpcError: { code: "42501", message: "permission denied" } }).client,
  });
  assert.deepEqual(deniedRpc, { ok: false, code: "rpc_denied" });
  const limitedRpc = await serverModule.generateAccountExportDownload({
    client: createClient({ rpcError: { code: "P0001", message: "export_limit_exceeded" } }).client,
  });
  assert.deepEqual(limitedRpc, { ok: false, code: "export_limit_exceeded" });
  const invalidSnapshot = await serverModule.generateAccountExportDownload({
    client: createClient({ rpcData: { ...snapshot, projects: "invalid" } }).client,
  });
  assert.deepEqual(invalidSnapshot, { ok: false, code: "invalid_snapshot" });

  const fileNames = serializers.ACCOUNT_EXPORT_V1_FILES;
  const atLimitFiles = emptyFiles(fileNames);
  atLimitFiles["README.txt"] = "x".repeat(serializers.ACCOUNT_EXPORT_V1_MAX_UNCOMPRESSED_BYTES);
  assert.equal(
    serializers.measureAccountExportV1Files(atLimitFiles),
    serializers.ACCOUNT_EXPORT_V1_MAX_UNCOMPRESSED_BYTES,
  );
  const fakeZip = (files, generatedAt) => ({
    files,
    fileName: `smart-finance-export-v1-${generatedAt.slice(0, 10)}.zip`,
    bytes: new Uint8Array([0x50, 0x4b]),
  });
  const acceptedBoundary = await serverModule.generateAccountExportDownload({
    client: createClient().client,
    generatedAt: timestamp,
    createFiles: () => atLimitFiles,
    createZip: fakeZip,
  });
  assert.equal(acceptedBoundary.ok, true);
  atLimitFiles["README.txt"] += "x";
  let zipCalled = false;
  const rejectedBoundary = await serverModule.generateAccountExportDownload({
    client: createClient().client,
    generatedAt: timestamp,
    createFiles: () => atLimitFiles,
    createZip: () => {
      zipCalled = true;
      return fakeZip(atLimitFiles, timestamp);
    },
  });
  assert.deepEqual(rejectedBoundary, { ok: false, code: "export_limit_exceeded" });
  assert.equal(zipCalled, false, "ZIP must not be generated above the final limit");
  assert.equal(
    serializers.measureAccountExportV1Files({ ...emptyFiles(fileNames), "README.txt": "ç" }),
    2,
    "measurement must use UTF-8 bytes",
  );
  const generationFailure = await serverModule.generateAccountExportDownload({
    client: createClient().client,
    generatedAt: timestamp,
    createZip: () => {
      throw new Error("sensitive payload must not escape");
    },
  });
  assert.deepEqual(generationFailure, { ok: false, code: "generation_failed" });

  const validRequest = new Request(
    "https://smart-finance.example/api/account/export?user_id=forbidden",
    {
      method: "POST",
      headers: { Origin: "https://smart-finance.example", "Content-Type": "application/json" },
      body: JSON.stringify({ owner_user_id: otherUserId, email: "forbidden@example.com" }),
    },
  );
  assert.equal(originModule.isSameOriginRequest(validRequest), true);
  assert.equal(
    originModule.isSameOriginRequest(
      new Request(validRequest.url, {
        method: "POST",
        headers: { Origin: "https://evil.example" },
      }),
    ),
    false,
  );
  assert.equal(
    originModule.isSameOriginRequest(
      new Request(validRequest.url, { method: "POST", headers: { Origin: "//evil.example" } }),
    ),
    false,
  );
  assert.equal(
    originModule.isSameOriginRequest(new Request(validRequest.url, { method: "POST" })),
    false,
  );

  let generatorArgumentCount = -1;
  const response = await httpModule.handleAccountExportRequest(validRequest, {
    generateDownload: async (...args) => {
      generatorArgumentCount = args.length;
      return success;
    },
  });
  assert.equal(generatorArgumentCount, 0, "request ownership input must never reach the generator");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/zip");
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("expires"), "0");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(
    response.headers.get("content-disposition"),
    'attachment; filename="smart-finance-export-v1-2026-08-31.zip"',
  );
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), success.bytes);

  const invalidMethod = await httpModule.handleAccountExportRequest(
    new Request(validRequest.url, {
      method: "GET",
      headers: { Origin: "https://smart-finance.example" },
    }),
  );
  assert.equal(invalidMethod.status, 405);
  assert.equal(invalidMethod.headers.get("allow"), "POST");
  assert.equal(await errorCode(invalidMethod), "method_not_allowed");
  const invalidOrigin = await httpModule.handleAccountExportRequest(
    new Request(validRequest.url, { method: "POST", headers: { Origin: "https://evil.example" } }),
  );
  assert.equal(invalidOrigin.status, 403);
  assert.equal(await errorCode(invalidOrigin), "request_forbidden");
  const authResponse = await httpModule.handleAccountExportRequest(validRequest, {
    generateDownload: async () => ({ ok: false, code: "authentication_required" }),
  });
  assert.equal(authResponse.status, 401);
  assert.equal(await errorCode(authResponse), "authentication_required");
  const limitResponse = await httpModule.handleAccountExportRequest(validRequest, {
    generateDownload: async () => ({ ok: false, code: "export_limit_exceeded" }),
  });
  assert.equal(limitResponse.status, 413);
  assert.equal(await errorCode(limitResponse), "export_limit_exceeded");
  const unavailableResponse = await httpModule.handleAccountExportRequest(validRequest, {
    generateDownload: async () => ({ ok: false, code: "invalid_snapshot" }),
  });
  assert.equal(unavailableResponse.status, 503);
  assert.equal(await errorCode(unavailableResponse), "export_unavailable");
  assert.equal(unavailableResponse.headers.get("cache-control"), "private, no-store, max-age=0");

  const serverSource = await readFile(
    new URL("../src/lib/account-export/account-export-server.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(serverSource, /console\.(?:log|error|warn)/);
  assert.doesNotMatch(serverSource, /localStorage|service_role|owner_user_id\s*:/);

  console.log("Account export server download, security, limits, and binary response passed.");
} finally {
  await vite.close();
}
