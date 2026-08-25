import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const mapper = await vite.ssrLoadModule("/src/lib/projects/project-mapper.ts");
  const repositoryModule = await vite.ssrLoadModule(
    "/src/lib/projects/remote-project-repository.ts",
  );
  const contract = await vite.ssrLoadModule("/src/lib/projects/project-repository.ts");
  const row = {
    id: "90000000-0000-0000-0000-000000000001",
    owner_user_id: "80000000-0000-0000-0000-000000000001",
    name: "Projeto remoto",
    type: null,
    description: "Descrição",
    version: 4,
    created_at: "2026-08-22T10:00:00.000Z",
    updated_at: "2026-08-22T11:00:00.000Z",
  };
  assert.deepEqual(mapper.mapProjectRow(row), {
    project: {
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    version: 4,
  });
  assert.deepEqual(
    mapper.projectInputToPersistence({ name: "  Nome  ", type: " ", description: " Texto " }),
    { name: "Nome", type: null, description: "Texto" },
  );

  const calls = [];
  const versioned = mapper.mapProjectRow(row);
  const gateway = {
    list: async () => ({ ok: true, data: [versioned] }),
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
  const repository = new repositoryModule.RemoteProjectRepository(gateway);
  assert.deepEqual(await repository.listProjects(), [versioned]);
  assert.deepEqual(await repository.getProject(row.id), versioned);
  await repository.createProject({ name: "Novo" });
  assert.equal((await repository.updateProject(row.id, 4, { name: "Alterado" })).version, 5);
  await repository.deleteProject(row.id, 5);
  assert.deepEqual(calls, [
    ["get", { id: row.id }],
    ["create", { name: "Novo" }],
    ["update", { id: row.id, expectedVersion: 4, input: { name: "Alterado" } }],
    ["delete", { id: row.id, expectedVersion: 5 }],
  ]);
  assert.equal(JSON.stringify(calls).includes("owner_user_id"), false);

  for (const [remoteCode, expectedCode] of [
    ["not_found", "PROJECT_NOT_FOUND"],
    ["conflict", "PROJECT_CONFLICT"],
    ["unavailable", "PROJECT_UNAVAILABLE"],
  ]) {
    const failing = new repositoryModule.RemoteProjectRepository({
      ...gateway,
      list: async () => ({ ok: false, code: remoteCode }),
    });
    await assert.rejects(
      failing.listProjects(),
      (error) => error instanceof contract.ProjectRepositoryError && error.code === expectedCode,
    );
  }

  const [appStoreSource, functionsSource, storeSource, remoteSource] = await Promise.all([
    readFile("src/lib/app-store.tsx", "utf8"),
    readFile("src/lib/projects/project-functions.ts", "utf8"),
    readFile("src/lib/projects/supabase-project-store.ts", "utf8"),
    readFile("src/lib/projects/remote-project-repository.ts", "utf8"),
  ]);
  assert.match(appStoreSource, /createFinancialRepositoryForMode/);
  assert.doesNotMatch(appStoreSource, /RemoteProjectRepository|project-functions/);
  assert.match(functionsSource, /context\.user\.id/);
  assert.doesNotMatch(functionsSource, /owner_user_id/);
  assert.match(storeSource, /owner_user_id: ownerUserId/);
  assert.match(storeSource, /\.eq\("version", expectedVersion\)/);
  assert.match(storeSource, /version: expectedVersion \+ 1/);
  assert.doesNotMatch(
    [functionsSource, storeSource, remoteSource].join("\n"),
    /service[_-]?role|sb_secret_|admin[_-]?key|database[_-]?password/i,
  );

  console.log("Project mapper e contrato remoto versionado: OK");
  console.log("Erros not_found/conflict/unavailable e payload sem ownership: OK");
  console.log("AppStore permanece exclusivamente local e sem credencial privilegiada: OK");
} finally {
  await vite.close();
}
