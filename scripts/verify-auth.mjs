import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { createClientRpc } from "@tanstack/start-client-core/client-rpc";
import { runWithStartContext } from "@tanstack/start-storage-context";
import { strFromU8, unzipSync } from "fflate";
import { createServer } from "vite";

const APP_ORIGIN = "http://127.0.0.1:3000";
const ACCOUNT_EXPORT_FILES = [
  "README.txt",
  "manifest.json",
  "account.json",
  "projects.csv",
  "transactions.csv",
  "import-profiles.json",
  "import-runs.csv",
  "project-preferences.json",
].sort();
process.env.TSS_SERVER_FN_BASE = "/_serverFn/";

async function readAccountExport(response) {
  assert.equal(response.status, 200, "account export succeeds");
  assert.equal(response.headers.get("content-type"), "application/zip");
  assert.match(
    response.headers.get("content-disposition") ?? "",
    /^attachment; filename="smart-finance-export-v1-\d{4}-\d{2}-\d{2}\.zip"$/,
  );
  assert.match(response.headers.get("cache-control") ?? "", /(?:^|,\s*)no-store(?:,|$)/);
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("expires"), "0");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");

  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 2)], [0x50, 0x4b], "response contains ZIP bytes");
  const archive = unzipSync(bytes);
  assert.deepEqual(
    Object.keys(archive).sort(),
    ACCOUNT_EXPORT_FILES,
    "ZIP contains all eight files",
  );
  return Object.fromEntries(
    Object.entries(archive).map(([name, contents]) => [name, strFromU8(contents)]),
  );
}

function joinedExport(files) {
  return Object.values(files).join("\n");
}

function readLocalSupabaseStatus() {
  const command =
    process.platform === "win32"
      ? "node_modules\\.bin\\supabase.exe"
      : "node_modules/.bin/supabase";
  const status = spawnSync(command, ["status", "-o", "env"], {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false,
  });
  if (status.status !== 0) {
    throw new Error(
      `Supabase local não está disponível. Execute npm run db:start. ${status.stderr ?? ""}`.trim(),
    );
  }
  const values = Object.fromEntries(
    status.stdout
      .split(/\r?\n/)
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^"|"$/g, "")];
      }),
  );
  assert.ok(values.API_URL, "local API URL is available");
  assert.ok(values.PUBLISHABLE_KEY, "local publishable key is available");
  assert.ok(values.MAILPIT_URL, "local Mailpit URL is available");
  return values;
}

function createCookieFetch() {
  const cookies = new Map();
  const request = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, APP_ORIGIN);
    const headers = new Headers(init.headers);
    headers.set("origin", APP_ORIGIN);
    headers.set("sec-fetch-site", "same-origin");
    if (cookies.size > 0) {
      headers.set("cookie", [...cookies].map(([name, value]) => `${name}=${value}`).join("; "));
    }
    const response = await fetch(url, { ...init, headers, redirect: "manual" });
    for (const value of response.headers.getSetCookie()) {
      const [pair, ...attributes] = value.split(";");
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator);
      const cookieValue = pair.slice(separator + 1);
      const expired = attributes.some((attribute) => /^max-age=0$/i.test(attribute.trim()));
      if (expired || cookieValue === "") cookies.delete(name);
      else cookies.set(name, cookieValue);
    }
    return response;
  };
  return { request, cookies };
}

function createRpcModule(serverModule) {
  return new Proxy(serverModule, {
    get(target, property) {
      const serverFunction = target[property];
      if (typeof serverFunction !== "function" || !serverFunction.serverFnMeta) {
        return serverFunction;
      }
      const rpc = createClientRpc(serverFunction.serverFnMeta.id);
      return async (options = {}) => {
        const response = await rpc({ ...options, method: serverFunction.method });
        if (response?.error) throw new Error("Server Function rejected the request");
        return response?.result;
      };
    },
  });
}

async function waitForServer(origin = APP_ORIGIN) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await fetch(`${origin}/favicon.ico`, { redirect: "manual" });
      return;
    } catch {
      // The development server is still starting.
    }
    await delay(250);
  }
  throw new Error("O servidor Vite não iniciou para o teste de Auth.");
}

async function readAuthEmailAction(mailpitUrl, email, expectedType) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const list = await fetch(`${mailpitUrl}/api/v1/messages`).then((response) => response.json());
    const messages = (list.messages ?? []).filter((item) =>
      item.To?.some((recipient) => recipient.Address === email),
    );
    for (const message of messages) {
      const detail = await fetch(`${mailpitUrl}/api/v1/message/${message.ID}`).then((response) =>
        response.json(),
      );
      const content = `${detail.Text ?? ""}\n${detail.HTML ?? ""}`.replaceAll("&amp;", "&");
      const match = content.match(/https?:\/\/127\.0\.0\.1:3000\/auth\/confirmar\?[^\s"'<>]+/);
      if (!match) continue;
      const actionUrl = new URL(match[0]);
      const fragment = new URLSearchParams(actionUrl.hash.slice(1));
      if (fragment.get("type") !== expectedType) continue;
      assert.ok(fragment.get("token_hash"), `${expectedType} email carries a token hash`);
      assert.equal(
        actionUrl.searchParams.has("token_hash"),
        false,
        "token is absent from query logs",
      );
      return actionUrl;
    }
    await delay(250);
  }
  throw new Error(`Mailpit não recebeu o e-mail ${expectedType} para ${email}.`);
}

const local = readLocalSupabaseStatus();
const env = {
  ...process.env,
  VITE_SUPABASE_URL: local.API_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY,
};

const viteBin =
  process.platform === "win32" ? "node_modules\\.bin\\vite.cmd" : "node_modules/.bin/vite";
let devServerOutput = "";
const devServer = spawn(viteBin, ["--host", "127.0.0.1", "--port", "3000", "--strictPort"], {
  cwd: process.cwd(),
  env,
  stdio: ["ignore", "pipe", "pipe"],
  shell: process.platform === "win32",
});
devServer.stdout.on("data", (chunk) => {
  devServerOutput += chunk.toString();
});
devServer.stderr.on("data", (chunk) => {
  devServerOutput += chunk.toString();
});

let vite;
try {
  await waitForServer();
  await Promise.all([
    fetch(`${APP_ORIGIN}/src/lib/auth/auth-functions.ts`),
    fetch(`${APP_ORIGIN}/src/lib/projects/project-functions.ts`),
    fetch(`${APP_ORIGIN}/src/lib/transactions/transaction-functions.ts`),
    fetch(`${APP_ORIGIN}/src/lib/imports/import-functions.ts`),
    fetch(`${APP_ORIGIN}/src/lib/preferences/preference-functions.ts`),
  ]);

  Object.assign(process.env, {
    VITE_SUPABASE_URL: local.API_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY,
  });
  vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  const auth = createRpcModule(await vite.ssrLoadModule("/src/lib/auth/auth-functions.ts"));
  const projects = createRpcModule(
    await vite.ssrLoadModule("/src/lib/projects/project-functions.ts"),
  );
  const transactions = createRpcModule(
    await vite.ssrLoadModule("/src/lib/transactions/transaction-functions.ts"),
  );
  const imports = createRpcModule(await vite.ssrLoadModule("/src/lib/imports/import-functions.ts"));
  const preferences = createRpcModule(
    await vite.ssrLoadModule("/src/lib/preferences/preference-functions.ts"),
  );

  await runWithStartContext({ startOptions: {} }, async () => {
    const runtimeSources = await Promise.all([
      readFile("src/lib/auth/auth-functions.ts", "utf8"),
      readFile("src/lib/auth/auth-server.ts", "utf8"),
      readFile("src/lib/projects/project-functions.ts", "utf8"),
      readFile("src/lib/projects/supabase-project-store.ts", "utf8"),
      readFile("src/lib/transactions/transaction-functions.ts", "utf8"),
      readFile("src/lib/transactions/supabase-transaction-store.ts", "utf8"),
      readFile("src/lib/imports/import-functions.ts", "utf8"),
      readFile("src/lib/imports/supabase-import-store.ts", "utf8"),
      readFile("src/lib/preferences/preference-functions.ts", "utf8"),
      readFile("src/lib/preferences/supabase-preference-store.ts", "utf8"),
      readFile("src/lib/account-export/account-export-server.ts", "utf8"),
      readFile("src/lib/account-export/account-export-http.ts", "utf8"),
      readFile("src/lib/supabase/server-client.ts", "utf8"),
    ]);
    assert.doesNotMatch(
      runtimeSources.join("\n"),
      /service[_-]?role|secret[_-]?key|admin[_-]?key/i,
      "runtime authentication code has no privileged credential path",
    );

    const safeRedirect = await vite.ssrLoadModule("/src/lib/auth/safe-redirect.ts");
    assert.equal(safeRedirect.sanitizeInternalRedirect("/dados?pagina=2"), "/dados?pagina=2");
    assert.equal(safeRedirect.sanitizeInternalRedirect("/"), "/dashboard");
    assert.equal(safeRedirect.sanitizeInternalRedirect("/?utm_source=email"), "/dashboard");
    assert.equal(safeRedirect.sanitizeInternalRedirect("https://evil.example"), "/dashboard");
    assert.equal(safeRedirect.sanitizeInternalRedirect("//evil.example"), "/dashboard");
    assert.equal(safeRedirect.sanitizeInternalRedirect("/auth/callback?code=secret"), "/dashboard");
    assert.deepEqual(auth.classifySessionFailure({ message: "JWT expired", status: 401 }), {
      status: "unauthenticated",
      reason: "expired",
    });
    assert.deepEqual(auth.classifySessionFailure({ name: "AuthRetryableFetchError", status: 0 }), {
      status: "unavailable",
    });

    const anonymous = createCookieFetch();
    const missingOriginExport = await fetch(`${APP_ORIGIN}/api/account/export`, {
      method: "POST",
      redirect: "manual",
    });
    assert.equal(missingOriginExport.status, 403, "export requires an Origin header");
    assert.equal((await missingOriginExport.json()).error, "request_forbidden");
    const invalidOriginExport = await fetch(`${APP_ORIGIN}/api/account/export`, {
      method: "POST",
      headers: { Origin: "https://evil.example" },
      redirect: "manual",
    });
    assert.equal(invalidOriginExport.status, 403, "export rejects a foreign Origin");
    assert.equal((await invalidOriginExport.json()).error, "request_forbidden");
    const invalidMethodExport = await fetch(`${APP_ORIGIN}/api/account/export`, {
      method: "GET",
      headers: { Origin: APP_ORIGIN },
      redirect: "manual",
    });
    assert.equal(invalidMethodExport.status, 405, "export accepts only POST");
    assert.equal(invalidMethodExport.headers.get("allow"), "POST");
    const anonymousExport = await anonymous.request("/api/account/export", {
      method: "POST",
      headers: { Accept: "application/zip" },
    });
    assert.equal(anonymousExport.status, 401, "export rejects an anonymous session");
    assert.equal((await anonymousExport.json()).error, "authentication_required");
    const privateWithoutSession = await anonymous.request("/dashboard");
    assert.ok(
      [302, 307].includes(privateWithoutSession.status),
      "private route redirects anonymously",
    );
    const loginLocation = new URL(privateWithoutSession.headers.get("location"), APP_ORIGIN);
    assert.equal(loginLocation.pathname, "/login");
    assert.equal(loginLocation.searchParams.get("redirect"), "/dashboard");
    await assert.rejects(
      () => projects.listRemoteProjects({ fetch: anonymous.request }),
      /Server Function rejected the request/,
      "anonymous Server Function access is rejected",
    );
    await assert.rejects(
      () =>
        transactions.listRemoteTransactions({
          data: { projectId: "80000000-0000-0000-0000-000000000001" },
          fetch: anonymous.request,
        }),
      /Server Function rejected the request/,
      "anonymous Transaction access is rejected",
    );
    await assert.rejects(
      () =>
        imports.prepareRemoteImportUpdate({
          data: { projectId: "80000000-0000-0000-0000-000000000001", rows: [] },
          fetch: anonymous.request,
        }),
      /Server Function rejected the request/,
      "anonymous Import access is rejected",
    );

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const accounts = [
      { email: `auth-a-${suffix}@example.test`, password: "SenhaSeguraA123!", name: "Usuário A" },
      { email: `auth-b-${suffix}@example.test`, password: "SenhaSeguraB123!", name: "Usuário B" },
    ];
    const clients = accounts.map(() => createCookieFetch());

    for (let index = 0; index < accounts.length; index += 1) {
      const account = accounts[index];
      const signup = await auth.signUp({
        data: {
          email: account.email,
          password: account.password,
          displayName: account.name,
          next: index === 0 ? "//evil.example" : "/dados",
        },
        fetch: clients[index].request,
      });
      assert.equal(signup.ok, true, `signup succeeds for user ${index + 1}`);
      if (index === 0) {
        await delay(1100);
        assert.equal(
          (
            await auth.resendSignupConfirmation({
              data: { email: account.email, next: "/dashboard" },
              fetch: clients[index].request,
            })
          ).ok,
          true,
          "confirmation email can be resent",
        );
      }
      const actionUrl = await readAuthEmailAction(local.MAILPIT_URL, account.email, "email");
      const confirmationClient = createCookieFetch();
      const actionPage = await confirmationClient.request(actionUrl.toString());
      assert.equal(actionPage.status, 200, "opening the email action does not consume its token");
      const confirmation = await auth.verifyEmailToken({
        data: {
          tokenHash: new URLSearchParams(actionUrl.hash.slice(1)).get("token_hash"),
          type: "email",
        },
        fetch: confirmationClient.request,
      });
      assert.equal(confirmation.ok, true, "a different browser context confirms signup");
      const callbackDestination = new URL(actionUrl.searchParams.get("next"), APP_ORIGIN);
      assert.equal(
        callbackDestination.pathname,
        index === 0 ? "/dashboard" : "/dados",
        "email action uses only the sanitized internal destination",
      );
      const confirmedUser = await auth.getCurrentUser({ fetch: confirmationClient.request });
      assert.equal(
        confirmedUser.email,
        account.email,
        "token verification establishes the session",
      );
      const reusedConfirmation = await auth.verifyEmailToken({
        data: {
          tokenHash: new URLSearchParams(actionUrl.hash.slice(1)).get("token_hash"),
          type: "email",
        },
        fetch: createCookieFetch().request,
      });
      assert.deepEqual(reusedConfirmation, { ok: false, code: "invalid_or_expired" });
      clients[index] = confirmationClient;
    }

    const missingCallback = await anonymous.request("/auth/callback");
    assert.ok(
      [302, 307].includes(missingCallback.status),
      "missing callback code redirects safely",
    );
    assert.equal(
      new URL(missingCallback.headers.get("location"), APP_ORIGIN).searchParams.get("authError"),
      "invalid_callback",
    );
    const invalidCallback = await anonymous.request("/auth/callback?code=invalid-code");
    assert.ok([302, 307].includes(invalidCallback.status), "invalid callback redirects safely");
    assert.equal(
      new URL(invalidCallback.headers.get("location"), APP_ORIGIN).searchParams.get("authError"),
      "invalid_callback",
    );

    const invalidLogin = await auth.signIn({
      data: { email: accounts[0].email, password: "SenhaIncorreta123!" },
      fetch: clients[0].request,
    });
    assert.deepEqual(invalidLogin, { ok: false, code: "invalid_credentials" });

    for (let index = 0; index < accounts.length; index += 1) {
      const login = await auth.signIn({
        data: { email: accounts[index].email, password: accounts[index].password },
        fetch: clients[index].request,
      });
      assert.equal(login.ok, true, `login succeeds for user ${index + 1}`);
      assert.ok(clients[index].cookies.size > 0, `session cookies exist for user ${index + 1}`);
      const current = await auth.getCurrentUser({ fetch: clients[index].request });
      assert.equal(current.email, accounts[index].email, `server validates user ${index + 1}`);

      const emptyExport = await readAccountExport(
        await clients[index].request("/api/account/export", {
          method: "POST",
          headers: { Accept: "application/zip" },
        }),
      );
      assert.equal(JSON.parse(emptyExport["account.json"]).email, accounts[index].email);
      assert.deepEqual(JSON.parse(emptyExport["manifest.json"]).counts, {
        projects: 0,
        transactions: 0,
        importProfiles: 0,
        importRuns: 0,
        projectPreferences: 0,
      });
      assert.equal(emptyExport["projects.csv"].trim().split(/\r?\n/).length, 1);
      assert.equal(emptyExport["transactions.csv"].trim().split(/\r?\n/).length, 1);
    }

    const authenticatedRoot = await clients[0].request("/");
    assert.ok([302, 307].includes(authenticatedRoot.status));
    assert.equal(
      new URL(authenticatedRoot.headers.get("location"), APP_ORIGIN).pathname,
      "/dashboard",
      "authenticated root always redirects to the canonical dashboard",
    );

    for (const url of [
      "/dashboard",
      "/dados",
      "/insights",
      "/relatorios",
      "/projetos",
      "/importar",
      "/criar",
      "/configuracoes",
    ]) {
      const response = await clients[0].request(url);
      assert.equal(response.status, 200, `${url} keeps its public URL when authenticated`);
    }

    const authenticatedLogin = await clients[0].request("/login?redirect=%2Fdados");
    assert.ok([302, 307].includes(authenticatedLogin.status));
    assert.equal(
      new URL(authenticatedLogin.headers.get("location"), APP_ORIGIN).pathname,
      "/dados",
      "login returns to the originally requested internal route",
    );
    for (const unsafeRedirect of ["https://evil.example", "//evil.example"]) {
      const response = await clients[0].request(
        `/login?redirect=${encodeURIComponent(unsafeRedirect)}`,
      );
      assert.equal(
        new URL(response.headers.get("location"), APP_ORIGIN).pathname,
        "/dashboard",
        "unsafe post-login redirect falls back to dashboard",
      );
    }

    const invalidSession = createCookieFetch();
    for (const cookieName of clients[0].cookies.keys()) {
      invalidSession.cookies.set(cookieName, "invalid-session-token");
    }
    assert.equal(
      await auth.getCurrentUser({ fetch: invalidSession.request }),
      null,
      "invalid session token is rejected safely",
    );
    const invalidSessionExport = await invalidSession.request("/api/account/export", {
      method: "POST",
      headers: { Accept: "application/zip" },
    });
    assert.equal(invalidSessionExport.status, 401, "expired export session is rejected");
    assert.equal((await invalidSessionExport.json()).error, "authentication_required");
    await assert.rejects(
      () => projects.listRemoteProjects({ fetch: invalidSession.request }),
      /Server Function rejected the request/,
      "invalid session cannot access protected Server Functions",
    );
    await assert.rejects(
      () =>
        transactions.listRemoteTransactions({
          data: { projectId: "80000000-0000-0000-0000-000000000001" },
          fetch: invalidSession.request,
        }),
      /Server Function rejected the request/,
      "invalid session cannot access Transaction Server Functions",
    );
    await assert.rejects(
      () =>
        imports.prepareRemoteImportUpdate({
          data: { projectId: "80000000-0000-0000-0000-000000000001", rows: [] },
          fetch: invalidSession.request,
        }),
      /Server Function rejected the request/,
      "invalid session cannot access Import Server Functions",
    );
    const invalidSessionRoute = await invalidSession.request("/dashboard");
    assert.ok([302, 307].includes(invalidSessionRoute.status));
    const invalidSessionDestination = new URL(
      invalidSessionRoute.headers.get("location"),
      APP_ORIGIN,
    );
    assert.equal(invalidSessionDestination.pathname, "/login");
    assert.equal(
      invalidSessionDestination.searchParams.get("reason"),
      "session_expired",
      "invalid session redirects once with a factual reason",
    );

    await assert.rejects(
      () =>
        projects.createRemoteProject({
          data: { name: "Ownership forjado", owner_user_id: accounts[1].email },
          fetch: clients[0].request,
        }),
      /Server Function rejected the request/,
      "owner_user_id is rejected instead of trusted from the browser",
    );

    const createdA = await projects.createRemoteProject({
      data: { name: "Projeto remoto A", type: "Comercial", description: "Pertence a A" },
      fetch: clients[0].request,
    });
    const createdB = await projects.createRemoteProject({
      data: { name: "Projeto remoto B", description: "Pertence a B" },
      fetch: clients[1].request,
    });
    assert.equal(createdA.ok, true);
    assert.equal(createdB.ok, true);
    const projectA = createdA.data;
    const projectB = createdB.data;
    assert.equal(projectA.version, 1);
    assert.equal(projectB.version, 1);
    assert.equal("owner_user_id" in projectA, false, "ownership is not exposed as domain data");

    const listA = await projects.listRemoteProjects({ fetch: clients[0].request });
    const listB = await projects.listRemoteProjects({ fetch: clients[1].request });
    assert.equal(listA.ok, true);
    assert.equal(listB.ok, true);
    assert.deepEqual(
      listA.data.map(({ project }) => project.id),
      [projectA.project.id],
    );
    assert.deepEqual(
      listB.data.map(({ project }) => project.id),
      [projectB.project.id],
    );

    const importProfile = {
      headers: ["Data", "Descrição", "Categoria", "Tipo", "Valor", "Filial", "Ativo"],
      columns: ["date", "description", "category", "type", "amount", "filial", "ativo"].map(
        (id, index) => ({
          id,
          header: ["Data", "Descrição", "Categoria", "Tipo", "Valor", "Filial", "Ativo"][index],
          index,
        }),
      ),
      mapping: {
        date: "date",
        description: "description",
        category: "category",
        type: "type",
        amount: "amount",
      },
    };
    const importedRow = {
      date: "2026-08-03",
      description: "Importação Auth",
      category: "Vendas",
      type: "receita",
      amount: 42.5,
      additionalData: { filial: "Fortaleza", ativo: true },
    };
    const initialCommands = clients.map((_, index) => ({
      idempotencyKey: crypto.randomUUID(),
      project: { name: `Importação técnica ${index + 1}` },
      file: { originalFilename: `auth-${index + 1}.csv`, fileHash: `${index + 1}`.repeat(64) },
      profile: importProfile,
      rows: [importedRow, importedRow],
      confirmPossibleDuplicates: true,
    }));
    const importedProjects = [];
    for (let index = 0; index < clients.length; index += 1) {
      const applied = await imports.applyInitialRemoteImport({
        data: initialCommands[index],
        fetch: clients[index].request,
      });
      assert.equal(applied.ok, true);
      assert.equal(applied.data.rowCount, 2);
      assert.equal(applied.data.duplicateCount, 2);
      importedProjects.push(applied.data);
    }
    const replayedImport = await imports.applyInitialRemoteImport({
      data: initialCommands[0],
      fetch: clients[0].request,
    });
    assert.equal(replayedImport.ok, true);
    assert.equal(
      replayedImport.data.replayed,
      true,
      "lost response retry returns committed import",
    );
    assert.deepEqual(
      await imports.prepareRemoteImportUpdate({
        data: { projectId: importedProjects[0].projectId, rows: [importedRow] },
        fetch: clients[1].request,
      }),
      { ok: false, code: "project_not_found" },
      "user B cannot prepare an import against user A project",
    );
    for (let index = 0; index < clients.length; index += 1) {
      const savedPreference = await preferences.updateRemoteProjectPreferences({
        data: {
          projectId: importedProjects[index].projectId,
          expectedVersion: null,
          visibleColumns: ["date", "description", "amount", "filial"],
          analyticDimensions: ["filial"],
        },
        fetch: clients[index].request,
      });
      assert.equal(savedPreference.ok, true, `preferences are saved for user ${index + 1}`);
      assert.equal(savedPreference.data.version, 1);
    }

    for (const [actor, target] of [
      [clients[0], projectB],
      [clients[1], projectA],
    ]) {
      assert.deepEqual(
        await projects.getRemoteProject({ data: { id: target.project.id }, fetch: actor.request }),
        { ok: true, data: null },
        "cross-owner read returns no project",
      );
      assert.deepEqual(
        await projects.updateRemoteProject({
          data: {
            id: target.project.id,
            expectedVersion: target.version,
            input: { name: "Tentativa cruzada" },
          },
          fetch: actor.request,
        }),
        { ok: false, code: "not_found" },
        "cross-owner update cannot distinguish a hidden project",
      );
      assert.deepEqual(
        await projects.deleteRemoteProject({
          data: { id: target.project.id, expectedVersion: target.version },
          fetch: actor.request,
        }),
        { ok: false, code: "not_found" },
        "cross-owner delete cannot distinguish a hidden project",
      );
    }

    const updatedA = await projects.updateRemoteProject({
      data: {
        id: projectA.project.id,
        expectedVersion: projectA.version,
        input: { name: "Projeto remoto A alterado", type: "Serviços" },
      },
      fetch: clients[0].request,
    });
    assert.equal(updatedA.ok, true);
    assert.equal(updatedA.data.version, 2, "successful update advances the version");
    assert.deepEqual(
      await projects.updateRemoteProject({
        data: {
          id: projectA.project.id,
          expectedVersion: 1,
          input: { name: "Atualização obsoleta" },
        },
        fetch: clients[0].request,
      }),
      { ok: false, code: "conflict" },
      "stale update is reported as a conflict",
    );
    assert.deepEqual(
      await projects.deleteRemoteProject({
        data: { id: projectA.project.id, expectedVersion: 1 },
        fetch: clients[0].request,
      }),
      { ok: false, code: "conflict" },
      "stale delete is reported as a conflict",
    );

    const identicalInput = {
      date: "2026-08-01",
      description: "Venda idêntica",
      category: "Comercial",
      type: "receita",
      amount: 125.5,
      origin: "manual",
      additionalData: {
        filial: "Fortaleza",
        quantidade: 2,
        ativo: true,
        vazio: null,
        competencia: "2026-08-01",
      },
    };
    for (const [actor, forgedOwner] of [
      [clients[0], accounts[1].email],
      [clients[1], accounts[0].email],
    ]) {
      await assert.rejects(
        () =>
          transactions.createRemoteTransaction({
            data: {
              projectId: actor === clients[0] ? projectA.project.id : projectB.project.id,
              input: identicalInput,
              owner_user_id: forgedOwner,
            },
            fetch: actor.request,
          }),
        /Server Function rejected the request/,
        "owner_user_id is rejected in both directions",
      );
    }
    await assert.rejects(
      () =>
        transactions.createRemoteTransaction({
          data: {
            projectId: projectA.project.id,
            input: { ...identicalInput, amount: 10.001 },
          },
          fetch: clients[0].request,
        }),
      /Server Function rejected the request/,
      "amounts incompatible with numeric cents are rejected",
    );
    await assert.rejects(
      () =>
        transactions.createRemoteTransaction({
          data: {
            projectId: projectA.project.id,
            input: { ...identicalInput, date: "2026-08-01T00:00:00.000Z" },
          },
          fetch: clients[0].request,
        }),
      /Server Function rejected the request/,
      "financial dates must be exact date-only values",
    );
    for (const [field, value] of [
      ["id", "94000000-0000-0000-0000-000000000001"],
      ["project_id", projectB.project.id],
      ["version", 99],
      ["import_run_id", "95000000-0000-0000-0000-000000000001"],
      ["manually_modified", true],
      ["created_at", "2026-08-01T00:00:00.000Z"],
      ["updated_at", "2026-08-01T00:00:00.000Z"],
    ]) {
      await assert.rejects(
        () =>
          transactions.createRemoteTransaction({
            data: {
              projectId: projectA.project.id,
              input: { ...identicalInput, [field]: value },
            },
            fetch: clients[0].request,
          }),
        /Server Function rejected the request/,
        `${field} cannot be controlled on create`,
      );
    }
    assert.deepEqual(
      await transactions.createRemoteTransaction({
        data: { projectId: projectB.project.id, input: identicalInput },
        fetch: clients[0].request,
      }),
      { ok: false, code: "project_not_found" },
      "user A cannot create a transaction in user B project",
    );
    assert.deepEqual(
      await transactions.createRemoteTransaction({
        data: { projectId: projectA.project.id, input: identicalInput },
        fetch: clients[1].request,
      }),
      { ok: false, code: "project_not_found" },
      "user B cannot create a transaction in user A project",
    );

    const createdManualA1 = await transactions.createRemoteTransaction({
      data: { projectId: projectA.project.id, input: identicalInput },
      fetch: clients[0].request,
    });
    const createdManualA2 = await transactions.createRemoteTransaction({
      data: { projectId: projectA.project.id, input: identicalInput },
      fetch: clients[0].request,
    });
    const createdImportedA = await transactions.createRemoteTransaction({
      data: {
        projectId: projectA.project.id,
        input: { ...identicalInput, origin: "imported" },
      },
      fetch: clients[0].request,
    });
    const createdBTransaction = await transactions.createRemoteTransaction({
      data: {
        projectId: projectB.project.id,
        input: {
          date: "2026-08-02",
          description: "Despesa B",
          category: "Operacional",
          type: "despesa",
          amount: 50.25,
          origin: "manual",
        },
      },
      fetch: clients[1].request,
    });
    for (const created of [
      createdManualA1,
      createdManualA2,
      createdImportedA,
      createdBTransaction,
    ]) {
      assert.equal(created.ok, true);
      assert.equal(created.data.version, 1);
      assert.equal("owner_user_id" in created.data, false);
    }
    assert.notEqual(
      createdManualA1.data.transaction.id,
      createdManualA2.data.transaction.id,
      "identical legitimate occurrences receive distinct UUIDs",
    );

    const exports = [];
    for (let index = 0; index < clients.length; index += 1) {
      exports.push(
        await readAccountExport(
          await clients[index].request("/api/account/export", {
            method: "POST",
            headers: { Accept: "application/zip" },
          }),
        ),
      );
      assert.equal(JSON.parse(exports[index]["account.json"]).email, accounts[index].email);
      const manifest = JSON.parse(exports[index]["manifest.json"]);
      assert.ok(manifest.counts.projects >= 2);
      assert.ok(manifest.counts.transactions >= 3);
      assert.equal(manifest.counts.importProfiles, 1);
      assert.equal(manifest.counts.importRuns, 1);
      assert.equal(manifest.counts.projectPreferences, 1);
      assert.match(exports[index]["import-profiles.json"], /"schemaVersion": 1/);
      assert.match(exports[index]["project-preferences.json"], /"filial"/);
      assert.match(exports[index]["import-runs.csv"], /completed/);
    }
    const exportA = joinedExport(exports[0]);
    const exportB = joinedExport(exports[1]);
    assert.match(exportA, /Projeto remoto A alterado/);
    assert.match(exportA, /2026-08-01/);
    assert.match(exportA, /125,50/);
    assert.match(exportA, /Fortaleza/);
    assert.doesNotMatch(
      exportA,
      new RegExp(accounts[1].email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    assert.doesNotMatch(exportA, /Projeto remoto B|Despesa B/);
    assert.match(exportB, /Projeto remoto B/);
    assert.match(exportB, /2026-08-02/);
    assert.match(exportB, /50,25/);
    assert.doesNotMatch(
      exportB,
      new RegExp(accounts[0].email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    assert.doesNotMatch(exportB, /Projeto remoto A alterado|Venda id.ntica/);
    for (const text of exports.map(joinedExport)) {
      for (const forbidden of [
        "access_token",
        "refresh_token",
        "password_hash",
        "encrypted_password",
        "service_role",
        "idempotency_key",
        "request_hash",
        "set-cookie",
      ]) {
        assert.doesNotMatch(text, new RegExp(forbidden, "i"));
      }
      assert.doesNotMatch(text, /SenhaSegura[AB]123!/);
    }

    const ownershipAttempt = await readAccountExport(
      await clients[0].request(
        `/api/account/export?user_id=${encodeURIComponent(accounts[1].email)}&owner_user_id=forged`,
        {
          method: "POST",
          headers: { Accept: "application/zip", "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: accounts[1].email, owner_user_id: "forged" }),
        },
      ),
    );
    const ownershipAttemptText = joinedExport(ownershipAttempt);
    assert.match(
      ownershipAttemptText,
      new RegExp(accounts[0].email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    assert.doesNotMatch(
      ownershipAttemptText,
      new RegExp(accounts[1].email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      "ownership parameters cannot select another account",
    );

    const transactionListA = await transactions.listRemoteTransactions({
      data: { projectId: projectA.project.id },
      fetch: clients[0].request,
    });
    assert.equal(transactionListA.ok, true);
    assert.equal(transactionListA.data.length, 3, "no identical occurrence is deduplicated");
    assert.equal(
      transactionListA.data.filter(({ transaction }) => transaction.origin === "manual").length,
      2,
      "two identical manual occurrences are preserved",
    );
    assert.equal(
      transactionListA.data.filter(({ transaction }) => transaction.origin === "imported").length,
      1,
      "an identical imported occurrence remains separate",
    );
    assert.deepEqual(
      transactionListA.data.map(({ transaction }) => transaction.id),
      transactionListA.data.map(({ transaction }) => transaction.id).sort(),
      "same-date rows use deterministic UUID ordering",
    );
    assert.deepEqual(
      createdImportedA.data.transaction.additionalData,
      identicalInput.additionalData,
    );
    assert.equal(createdImportedA.data.transaction.date, "2026-08-01");
    assert.equal(createdImportedA.data.transaction.amount, 125.5);

    for (const [actor, ownProject, foreignProject, foreignTransaction] of [
      [clients[0], projectA, projectB, createdBTransaction.data],
      [clients[1], projectB, projectA, createdManualA1.data],
    ]) {
      assert.deepEqual(
        await transactions.getRemoteTransaction({
          data: {
            projectId: foreignProject.project.id,
            transactionId: foreignTransaction.transaction.id,
          },
          fetch: actor.request,
        }),
        { ok: false, code: "project_not_found" },
        "a foreign project is indistinguishable from a missing project",
      );
      assert.deepEqual(
        await transactions.updateRemoteTransaction({
          data: {
            projectId: foreignProject.project.id,
            transactionId: foreignTransaction.transaction.id,
            expectedVersion: foreignTransaction.version,
            input: { description: "Tentativa em projeto alheio" },
          },
          fetch: actor.request,
        }),
        { ok: false, code: "project_not_found" },
        "cross-owner update through a foreign project reveals no project",
      );
      assert.deepEqual(
        await transactions.deleteRemoteTransaction({
          data: {
            projectId: foreignProject.project.id,
            transactionId: foreignTransaction.transaction.id,
            expectedVersion: foreignTransaction.version,
          },
          fetch: actor.request,
        }),
        { ok: false, code: "project_not_found" },
        "cross-owner delete through a foreign project reveals no project",
      );
      assert.deepEqual(
        await transactions.getRemoteTransaction({
          data: {
            projectId: ownProject.project.id,
            transactionId: foreignTransaction.transaction.id,
          },
          fetch: actor.request,
        }),
        { ok: true, data: null },
        "a foreign transaction id is invisible inside an owned project",
      );
      assert.deepEqual(
        await transactions.updateRemoteTransaction({
          data: {
            projectId: ownProject.project.id,
            transactionId: foreignTransaction.transaction.id,
            expectedVersion: foreignTransaction.version,
            input: { description: "Tentativa cruzada" },
          },
          fetch: actor.request,
        }),
        { ok: false, code: "transaction_not_found" },
        "cross-owner update reveals no foreign transaction",
      );
      assert.deepEqual(
        await transactions.deleteRemoteTransaction({
          data: {
            projectId: ownProject.project.id,
            transactionId: foreignTransaction.transaction.id,
            expectedVersion: foreignTransaction.version,
          },
          fetch: actor.request,
        }),
        { ok: false, code: "transaction_not_found" },
        "cross-owner delete reveals no foreign transaction",
      );
    }

    const updatedImported = await transactions.updateRemoteTransaction({
      data: {
        projectId: projectA.project.id,
        transactionId: createdImportedA.data.transaction.id,
        expectedVersion: 1,
        input: { description: "Venda importada editada" },
      },
      fetch: clients[0].request,
    });
    assert.equal(updatedImported.ok, true);
    assert.equal(updatedImported.data.version, 2);
    assert.equal(updatedImported.data.transaction.origin, "imported");
    assert.equal(updatedImported.data.transaction.manuallyModified, true);
    assert.deepEqual(
      updatedImported.data.transaction.additionalData,
      identicalInput.additionalData,
      "editing core fields preserves additionalData",
    );
    await assert.rejects(
      () =>
        transactions.updateRemoteTransaction({
          data: {
            projectId: projectA.project.id,
            transactionId: createdImportedA.data.transaction.id,
            expectedVersion: 2,
            input: { origin: "manual" },
          },
          fetch: clients[0].request,
        }),
      /Server Function rejected the request/,
      "origin is immutable after creation",
    );
    assert.deepEqual(
      await transactions.updateRemoteTransaction({
        data: {
          projectId: projectA.project.id,
          transactionId: createdImportedA.data.transaction.id,
          expectedVersion: 1,
          input: { amount: 200 },
        },
        fetch: clients[0].request,
      }),
      { ok: false, code: "conflict" },
      "a stale transaction update returns a conflict",
    );
    assert.deepEqual(
      await transactions.deleteRemoteTransaction({
        data: {
          projectId: projectA.project.id,
          transactionId: createdImportedA.data.transaction.id,
          expectedVersion: 1,
        },
        fetch: clients[0].request,
      }),
      { ok: false, code: "conflict" },
      "a stale transaction delete returns a conflict",
    );
    assert.deepEqual(
      await transactions.deleteRemoteTransaction({
        data: {
          projectId: projectB.project.id,
          transactionId: createdBTransaction.data.transaction.id,
          expectedVersion: 1,
        },
        fetch: clients[1].request,
      }),
      { ok: true, data: null },
      "an owner can delete its current transaction",
    );

    const currentProjectABeforeDelete = await projects.getRemoteProject({
      data: { id: projectA.project.id },
      fetch: clients[0].request,
    });
    assert.equal(currentProjectABeforeDelete.ok, true);
    assert.deepEqual(
      await projects.deleteRemoteProject({
        data: {
          id: projectA.project.id,
          expectedVersion: currentProjectABeforeDelete.data.version,
        },
        fetch: clients[0].request,
      }),
      { ok: true, data: null },
    );
    for (let index = 0; index < importedProjects.length; index += 1) {
      const current = await projects.getRemoteProject({
        data: { id: importedProjects[index].projectId },
        fetch: clients[index].request,
      });
      assert.equal(current.ok, true);
      assert.deepEqual(
        await projects.deleteRemoteProject({
          data: { id: importedProjects[index].projectId, expectedVersion: current.data.version },
          fetch: clients[index].request,
        }),
        { ok: true, data: null },
      );
    }
    assert.deepEqual(
      await transactions.listRemoteTransactions({
        data: { projectId: projectA.project.id },
        fetch: clients[0].request,
      }),
      { ok: false, code: "project_not_found" },
      "transactions are no longer addressable after their project is deleted",
    );
    const currentProjectBBeforeDelete = await projects.getRemoteProject({
      data: { id: projectB.project.id },
      fetch: clients[1].request,
    });
    assert.equal(currentProjectBBeforeDelete.ok, true);
    assert.deepEqual(
      await projects.deleteRemoteProject({
        data: {
          id: projectB.project.id,
          expectedVersion: currentProjectBBeforeDelete.data.version,
        },
        fetch: clients[1].request,
      }),
      { ok: true, data: null },
    );

    const refreshed = await auth.refreshCurrentSession({ fetch: clients[0].request });
    assert.equal(
      refreshed.email,
      accounts[0].email,
      "refresh preserves the authenticated identity",
    );

    const recoveryClient = createCookieFetch();
    assert.equal(
      (
        await auth.requestPasswordRecovery({
          data: { email: accounts[1].email },
          fetch: recoveryClient.request,
        })
      ).ok,
      true,
      "password recovery request is accepted",
    );
    const recoveryActionUrl = await readAuthEmailAction(
      local.MAILPIT_URL,
      accounts[1].email,
      "recovery",
    );
    const recoveryConfirmationClient = createCookieFetch();
    assert.equal(
      (await recoveryConfirmationClient.request(recoveryActionUrl.toString())).status,
      200,
      "opening recovery email does not consume its token",
    );
    assert.equal(
      (
        await auth.verifyEmailToken({
          data: {
            tokenHash: new URLSearchParams(recoveryActionUrl.hash.slice(1)).get("token_hash"),
            type: "recovery",
          },
          fetch: recoveryConfirmationClient.request,
        })
      ).ok,
      true,
      "a different browser context confirms recovery",
    );
    const replacementPassword = "NovaSenhaSeguraB456!";
    assert.equal(
      (
        await auth.updateRecoveredPassword({
          data: { password: replacementPassword },
          fetch: recoveryConfirmationClient.request,
        })
      ).ok,
      true,
      "authenticated recovery session can redefine the password",
    );
    await auth.signOut({ fetch: recoveryConfirmationClient.request });
    assert.deepEqual(
      await auth.signIn({
        data: { email: accounts[1].email, password: accounts[1].password },
        fetch: recoveryConfirmationClient.request,
      }),
      { ok: false, code: "invalid_credentials" },
      "old password no longer authenticates",
    );
    assert.equal(
      (
        await auth.signIn({
          data: { email: accounts[1].email, password: replacementPassword },
          fetch: recoveryConfirmationClient.request,
        })
      ).ok,
      true,
      "new password authenticates",
    );
    assert.equal((await auth.signOut({ fetch: clients[0].request })).ok, true, "logout succeeds");
    assert.equal(
      await auth.getCurrentUser({ fetch: clients[0].request }),
      null,
      "logout clears session",
    );
    await assert.rejects(
      () => projects.listRemoteProjects({ fetch: clients[0].request }),
      /Server Function rejected the request/,
      "logged-out session cannot access protected Server Functions",
    );
    await assert.rejects(
      () =>
        transactions.listRemoteTransactions({
          data: { projectId: projectA.project.id },
          fetch: clients[0].request,
        }),
      /Server Function rejected the request/,
      "logged-out session cannot access Transaction Server Functions",
    );

    const routeSources = await Promise.all([
      readFile("src/routes/_authenticated.tsx", "utf8"),
      readFile("src/routes/__root.tsx", "utf8"),
      readFile("src/lib/auth/auth-provider.tsx", "utf8"),
      readFile("src/components/app/app-shell.tsx", "utf8"),
      readFile("src/routes/_authenticated/configuracoes.tsx", "utf8"),
    ]);
    assert.doesNotMatch(
      routeSources.join("\n"),
      /project-functions|transaction-functions|import-functions|RemoteProjectRepository|RemoteTransactionRepository|RemoteImportRepository|\.from\(["'](?:transactions|projects|import_profiles|import_runs)["']\)/,
      "product routes do not connect remote repositories or financial tables",
    );
    assert.doesNotMatch(
      routeSources.join("\n"),
      /localStorage|STORAGE_KEY|smart-finance-state/,
      "authentication UI does not directly manipulate financial localStorage",
    );
    assert.match(
      routeSources[0],
      /<AppProvider key=\{`\$\{user\.id\}:\$\{mode\}`\} userId=\{user\.id\} mode=\{mode\}>/,
      "validated identity scopes the separate financial provider",
    );
    const authProviderSource = routeSources[2];
    assert.match(authProviderSource, /createContext/);
    assert.doesNotMatch(
      authProviderSource,
      /useApp|AppProvider|project|transaction/i,
      "AuthProvider remains independent from financial application state",
    );

    const unavailableOrigin = "http://127.0.0.1:3001";
    const unavailableServer = spawn(
      viteBin,
      ["--host", "127.0.0.1", "--port", "3001", "--strictPort"],
      {
        cwd: process.cwd(),
        env: { ...env, VITE_SUPABASE_URL: "http://127.0.0.1:59999" },
        stdio: "ignore",
        shell: process.platform === "win32",
      },
    );
    try {
      await waitForServer(unavailableOrigin);
      const authenticatedCookieHeader = [...recoveryConfirmationClient.cookies]
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
      const unavailableResponse = await fetch(`${unavailableOrigin}/dashboard`, {
        headers: { cookie: authenticatedCookieHeader },
        redirect: "manual",
      });
      assert.ok([302, 307].includes(unavailableResponse.status));
      const unavailableLocation = new URL(
        unavailableResponse.headers.get("location"),
        unavailableOrigin,
      );
      assert.equal(
        unavailableLocation.pathname,
        "/auth-indisponivel",
        "Auth outage uses a public non-recursive failure route",
      );
      const unavailablePage = await fetch(`${unavailableOrigin}/auth-indisponivel`, {
        redirect: "manual",
      });
      assert.equal(
        unavailablePage.status,
        200,
        "Auth outage page never rechecks Auth or redirects",
      );
    } finally {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/pid", String(unavailableServer.pid), "/t", "/f"], {
          stdio: "ignore",
        });
      } else {
        unavailableServer.kill("SIGTERM");
      }
    }

    console.log("Auth/session/RLS verification passed.");
  });
} catch (error) {
  if (devServerOutput.trim()) console.error(devServerOutput.trim());
  throw error;
} finally {
  await vite?.close();
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(devServer.pid), "/t", "/f"], { stdio: "ignore" });
  } else {
    devServer.kill("SIGTERM");
  }
}
