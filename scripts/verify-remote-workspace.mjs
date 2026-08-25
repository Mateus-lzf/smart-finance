import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const mapper = await vite.ssrLoadModule("/src/lib/workspace/remote-workspace-mapper.ts");
  const workspaceModule = await vite.ssrLoadModule(
    "/src/lib/workspace/remote-workspace-repository.ts",
  );
  const workspaceTypes = await vite.ssrLoadModule("/src/lib/workspace/remote-workspace-types.ts");
  const preferenceModule = await vite.ssrLoadModule(
    "/src/lib/preferences/remote-project-preferences-repository.ts",
  );
  const preferenceTypes = await vite.ssrLoadModule(
    "/src/lib/preferences/project-preferences-repository.ts",
  );

  const owner = "e1000000-0000-0000-0000-000000000001";
  const project = "e2000000-0000-0000-0000-000000000001";
  const projectWithoutMetadata = "e2000000-0000-0000-0000-000000000002";
  const timestamps = { created_at: "2026-08-24T10:00:00Z", updated_at: "2026-08-24T11:00:00Z" };
  const raw = {
    projects: [
      {
        id: project,
        owner_user_id: owner,
        name: "A",
        type: null,
        description: null,
        version: 5,
        ...timestamps,
      },
      {
        id: projectWithoutMetadata,
        owner_user_id: owner,
        name: "B",
        type: null,
        description: null,
        version: 1,
        ...timestamps,
      },
    ],
    transactions: [
      {
        id: "e3000000-0000-0000-0000-000000000001",
        project_id: project,
        owner_user_id: owner,
        date: "2026-08-24",
        description: "Venda",
        category: "Vendas",
        type: "receita",
        amount: 125.5,
        origin: "imported",
        manually_modified: false,
        additional_data: { branch: "Fortaleza", active: true, rank: 2, empty: null },
        import_run_id: null,
        version: 3,
        ...timestamps,
      },
    ],
    import_profiles: [
      {
        project_id: project,
        owner_user_id: owner,
        schema_version: 1,
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
        ...timestamps,
      },
    ],
    project_preferences: [
      {
        project_id: project,
        user_id: owner,
        visible_columns: [],
        analytical_dimensions: [],
        version: 2,
        ...timestamps,
      },
    ],
  };

  const snapshot = mapper.mapRemoteWorkspaceSnapshot(raw);
  assert.equal(snapshot.projects.length, 2);
  assert.equal(snapshot.projects[0].version, 5);
  assert.equal(snapshot.transactionsByProject[project][0].version, 3);
  assert.deepEqual(snapshot.transactionsByProject[project][0].transaction.additionalData, {
    branch: "Fortaleza",
    active: true,
    rank: 2,
    empty: null,
  });
  assert.deepEqual(snapshot.transactionsByProject[projectWithoutMetadata], []);
  assert.equal(snapshot.importProfilesByProject[project].headers.at(-1), "Filial");
  assert.equal(snapshot.importProfilesByProject[projectWithoutMetadata], undefined);
  assert.deepEqual(snapshot.preferencesByProject[project].preferences.visibleColumns, []);
  assert.equal(snapshot.preferencesByProject[project].version, 2);
  assert.equal(snapshot.preferencesByProject[projectWithoutMetadata].exists, false);
  assert.equal(snapshot.preferencesByProject[projectWithoutMetadata].version, null);
  assert.throws(
    () =>
      mapper.mapRemoteWorkspaceSnapshot({
        ...raw,
        import_profiles: [{ ...raw.import_profiles[0], schema_version: 2 }],
      }),
    /não suportada/,
  );
  assert.throws(
    () =>
      mapper.mapRemoteWorkspaceSnapshot({ ...raw, projects: [raw.projects[0], raw.projects[0]] }),
    /duplicado/,
  );

  const workspaceRepository = new workspaceModule.SupabaseRemoteWorkspaceRepository({
    load: async () => ({ ok: true, data: snapshot }),
  });
  assert.deepEqual(await workspaceRepository.loadWorkspaceSnapshot(), snapshot);
  for (const [remoteCode, expected] of [
    ["invalid_snapshot", "WORKSPACE_INVALID"],
    ["unsupported_profile", "WORKSPACE_PROFILE_UNSUPPORTED"],
    ["unavailable", "WORKSPACE_UNAVAILABLE"],
  ]) {
    const failing = new workspaceModule.SupabaseRemoteWorkspaceRepository({
      load: async () => ({ ok: false, code: remoteCode }),
    });
    await assert.rejects(
      failing.loadWorkspaceSnapshot(),
      (error) => error instanceof workspaceTypes.RemoteWorkspaceError && error.code === expected,
    );
  }

  const calls = [];
  const preferenceRepository = new preferenceModule.RemoteProjectPreferencesRepository({
    get: async (data) => {
      calls.push(["get", data]);
      return { ok: true, data: preferenceTypes.defaultProjectPreferences() };
    },
    update: async (data) => {
      calls.push(["update", data]);
      return {
        ok: true,
        data: {
          preferences: {
            visibleColumns: data.visibleColumns,
            analyticDimensions: data.analyticDimensions,
          },
          version: (data.expectedVersion ?? 0) + 1,
          exists: true,
        },
      };
    },
  });
  assert.equal((await preferenceRepository.getProjectPreferences(project)).exists, false);
  assert.equal(
    (
      await preferenceRepository.updateProjectPreferences(project, null, {
        visibleColumns: [],
        analyticDimensions: [],
      })
    ).version,
    1,
  );
  assert.equal(JSON.stringify(calls).includes("owner_user_id"), false);
  const conflict = new preferenceModule.RemoteProjectPreferencesRepository({
    get: async () => ({ ok: false, code: "unavailable" }),
    update: async () => ({ ok: false, code: "conflict" }),
  });
  await assert.rejects(
    conflict.updateProjectPreferences(project, 1, { visibleColumns: [], analyticDimensions: [] }),
    (error) =>
      error instanceof preferenceTypes.ProjectPreferencesRepositoryError &&
      error.code === "PREFERENCES_CONFLICT",
  );

  const [appStore, localRepository, functions, migration] = await Promise.all([
    readFile("src/lib/app-store.tsx", "utf8"),
    readFile("src/lib/local-financial-repository.ts", "utf8"),
    readFile("src/lib/workspace/workspace-functions.ts", "utf8"),
    readFile("supabase/migrations/202608240001_create_remote_workspace_metadata.sql", "utf8"),
  ]);
  assert.match(appStore, /createFinancialRepositoryForMode/);
  assert.doesNotMatch(appStore, /RemoteWorkspace|ProjectPreferencesRepository|SupabaseRemote/);
  assert.doesNotMatch(localRepository, /Supabase|RemoteWorkspace|ProjectPreferencesRepository/);
  assert.doesNotMatch(functions, /user_id|owner_user_id/);
  assert.match(migration, /security invoker/gi);
  assert.doesNotMatch(
    [functions, migration].join("\n"),
    /service[_-]?role|sb_secret_|admin[_-]?key/i,
  );

  console.log("Snapshot remoto, versões, profiles e defaults de preferences: OK");
  console.log("Repositories estreitos, conflitos e ausência de ownership no payload: OK");
  console.log("AppStore e LocalFinancialRepository permanecem exclusivamente locais: OK");
} finally {
  await vite.close();
}
