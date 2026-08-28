import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";

const userA = "70000000-0000-4000-8000-000000000001";
const userB = "70000000-0000-4000-8000-000000000002";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const modeModule = await vite.ssrLoadModule("/src/lib/financial-mode.server.ts");
  const factoryModule = await vite.ssrLoadModule("/src/lib/financial-repository-factory.ts");
  const activeProjectModule = await vite.ssrLoadModule("/src/lib/active-project-preference.ts");

  assert.equal(modeModule.resolveFinancialModeForUser(userA, undefined), "local");
  assert.equal(modeModule.resolveFinancialModeForUser(userA, ""), "local");
  assert.equal(modeModule.resolveFinancialModeForUser(userA, userB), "local");
  assert.equal(modeModule.resolveFinancialModeForUser(userA, userA), "remote");
  assert.equal(modeModule.resolveFinancialModeForUser(userB, `${userA},${userB}`), "remote");
  assert.equal(modeModule.resolveFinancialModeForUser(userA, "not-a-user-id"), "local");
  assert.equal(modeModule.resolveFinancialModeForUser(userA, `${userA},${userA}`), "local");

  const calls = [];
  const localRepository = { source: "local-A" };
  const remoteRepository = { source: "remote-B" };
  const factories = {
    local: (userId) => {
      calls.push(["local", userId]);
      return localRepository;
    },
    remote: async () => {
      calls.push(["remote"]);
      return remoteRepository;
    },
  };
  assert.equal(
    await factoryModule.createFinancialRepositoryForMode("local", userA, factories),
    localRepository,
  );
  assert.deepEqual(calls, [["local", userA]]);
  calls.length = 0;
  assert.equal(
    await factoryModule.createFinancialRepositoryForMode("remote", userB, factories),
    remoteRepository,
  );
  assert.deepEqual(calls, [["remote"]]);

  let localFallbackCalls = 0;
  await assert.rejects(
    factoryModule.createFinancialRepositoryForMode("remote", userA, {
      local: () => {
        localFallbackCalls += 1;
        return localRepository;
      },
      remote: async () => {
        throw new Error("remote unavailable");
      },
    }),
    /remote unavailable/,
  );
  assert.equal(localFallbackCalls, 0, "remote failures never fall back to local persistence");

  const preferenceStorage = new Map();
  const storage = {
    getItem: (key) => preferenceStorage.get(key) ?? null,
    setItem: (key, value) => preferenceStorage.set(key, value),
    removeItem: (key) => preferenceStorage.delete(key),
  };
  activeProjectModule.persistActiveProjectPreference(storage, userA, "project-second");
  assert.equal(activeProjectModule.loadActiveProjectPreference(storage, userA), "project-second");
  assert.equal(activeProjectModule.loadActiveProjectPreference(storage, userB), null);
  activeProjectModule.persistActiveProjectPreference(storage, userA, null);
  assert.equal(activeProjectModule.loadActiveProjectPreference(storage, userA), null);

  const [route, appStore, gate, modeFunctions, factory, localRepositorySource] = await Promise.all([
    readFile("src/routes/_authenticated.tsx", "utf8"),
    readFile("src/lib/app-store.tsx", "utf8"),
    readFile("src/components/app/financial-state-gate.tsx", "utf8"),
    readFile("src/lib/financial-mode-functions.ts", "utf8"),
    readFile("src/lib/financial-repository-factory.ts", "utf8"),
    readFile("src/lib/local-financial-repository.ts", "utf8"),
  ]);
  assert.match(modeFunctions, /context\.user\.id/);
  assert.doesNotMatch(modeFunctions, /\.validator\(|userId\s*:/);
  assert.match(route, /getFinancialMode\(\)/);
  assert.match(route, /mode=\{financialMode\}/);
  assert.match(route, /<FinancialStateGate>/);
  assert.match(gate, /financialStatus === "ready"/);
  assert.match(gate, /financialStatus === "initializing"/);
  assert.doesNotMatch(gate, /projects\.length|activeProjectId/);
  assert.match(appStore, /createFinancialRepositoryForMode/);
  assert.doesNotMatch(appStore, /createLocalFinancialRepository|localStorage/);
  assert.match(appStore, /setWorkspace\(emptyFinancialWorkspace\(\)\)/);
  assert.match(appStore, /applyRemoteActiveProjectPreference/);
  assert.match(appStore, /createBrowserActiveProjectPreference/);
  assert.match(appStore, /error\.code === "CONFLICT"/);
  const settingsSource = await readFile("src/routes/_authenticated/configuracoes.tsx", "utf8");
  assert.match(settingsSource, /financialMode === "remote"/);
  assert.match(settingsSource, /Dados sincronizados com sua conta/);
  assert.match(settingsSource, /Dados salvos somente neste dispositivo/);
  assert.match(factory, /mode === "remote" \? factories\.remote\(\) :/);
  assert.doesNotMatch(factory, /catch\(|fallback/i);
  assert.match(localRepositorySource, /getUserLocalStateKey/);

  const sourceRoots = ["src/routes", "src/components"];
  const sourceFiles = [];
  async function collect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await collect(fullPath);
      else if (/\.(ts|tsx)$/.test(entry.name)) sourceFiles.push(fullPath);
    }
  }
  for (const root of sourceRoots) await collect(root);
  for (const file of sourceFiles) {
    const source = await readFile(file, "utf8");
    if (file.endsWith(path.join("routes", "_authenticated.tsx"))) continue;
    assert.doesNotMatch(
      source,
      /RemoteFinancialRepository|createRemoteFinancialRepository|createLocalFinancialRepository/,
      `${file} must not choose a financial backend`,
    );
  }

  for (const file of [".env.example", ".env.staging.example", ".env.cloudflare.staging.example"]) {
    const source = await readFile(file, "utf8");
    assert.match(source, /^SMART_FINANCE_REMOTE_PILOT_USER_IDS=$/m);
    assert.doesNotMatch(source, /VITE_SMART_FINANCE_REMOTE_PILOT_USER_IDS/);
    assert.doesNotMatch(
      source,
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    );
  }

  console.log("Financial mode server authority and source-isolation checks passed.");
} finally {
  await vite.close();
}
