import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { createClientRpc } from "@tanstack/start-client-core/client-rpc";
import { runWithStartContext } from "@tanstack/start-storage-context";
import { createServer } from "vite";

const APP_ORIGIN = "http://127.0.0.1:3000";
process.env.TSS_SERVER_FN_BASE = "/_serverFn/";

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

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(APP_ORIGIN, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // The development server is still starting.
    }
    await delay(250);
  }
  throw new Error("O servidor Vite não iniciou para o teste de Auth.");
}

async function confirmEmail(mailpitUrl, email) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const list = await fetch(`${mailpitUrl}/api/v1/messages`).then((response) => response.json());
    const message = list.messages?.find((item) =>
      item.To?.some((recipient) => recipient.Address === email),
    );
    if (message) {
      const detail = await fetch(`${mailpitUrl}/api/v1/message/${message.ID}`).then((response) =>
        response.json(),
      );
      const content = `${detail.Text ?? ""}\n${detail.HTML ?? ""}`.replaceAll("&amp;", "&");
      const match = content.match(/https?:\/\/127\.0\.0\.1:54321\/auth\/v1\/verify\?[^\s"'<>]+/);
      assert.ok(match, `confirmation link exists for ${email}`);
      const verified = await fetch(match[0], { redirect: "manual" });
      assert.ok([302, 303].includes(verified.status), `confirmation succeeds for ${email}`);
      return;
    }
    await delay(250);
  }
  throw new Error(`Mailpit não recebeu a confirmação para ${email}.`);
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
    fetch(`${APP_ORIGIN}/src/lib/auth/technical-project-functions.ts`),
  ]);

  Object.assign(process.env, {
    VITE_SUPABASE_URL: local.API_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY,
  });
  vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  const auth = createRpcModule(await vite.ssrLoadModule("/src/lib/auth/auth-functions.ts"));
  const projects = createRpcModule(
    await vite.ssrLoadModule("/src/lib/auth/technical-project-functions.ts"),
  );

  await runWithStartContext({ startOptions: {} }, async () => {
    const runtimeSources = await Promise.all([
      readFile("src/lib/auth/auth-functions.ts", "utf8"),
      readFile("src/lib/auth/auth-server.ts", "utf8"),
      readFile("src/lib/auth/technical-project-functions.ts", "utf8"),
      readFile("src/lib/supabase/server-client.ts", "utf8"),
    ]);
    assert.doesNotMatch(
      runtimeSources.join("\n"),
      /service[_-]?role|secret[_-]?key|admin[_-]?key/i,
      "runtime authentication code has no privileged credential path",
    );

    const anonymous = createCookieFetch();
    await assert.rejects(
      () => projects.listTechnicalProjects({ fetch: anonymous.request }),
      /Server Function rejected the request/,
      "anonymous Server Function access is rejected",
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
        data: { email: account.email, password: account.password, displayName: account.name },
        fetch: clients[index].request,
      });
      assert.equal(signup.ok, true, `signup succeeds for user ${index + 1}`);
      await confirmEmail(local.MAILPIT_URL, account.email);
    }

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
    await assert.rejects(
      () => projects.listTechnicalProjects({ fetch: invalidSession.request }),
      /Server Function rejected the request/,
      "invalid session cannot access protected Server Functions",
    );

    const projectA = await projects.createTechnicalProject({
      data: { name: "Projeto técnico A", owner_user_id: "client-controlled-value" },
      fetch: clients[0].request,
    });
    const projectB = await projects.createTechnicalProject({
      data: { name: "Projeto técnico B" },
      fetch: clients[1].request,
    });
    assert.notEqual(
      projectA.owner_user_id,
      projectB.owner_user_id,
      "owners derive from distinct sessions",
    );

    const listA = await projects.listTechnicalProjects({ fetch: clients[0].request });
    const listB = await projects.listTechnicalProjects({ fetch: clients[1].request });
    assert.deepEqual(
      listA.map((project) => project.id),
      [projectA.id],
    );
    assert.deepEqual(
      listB.map((project) => project.id),
      [projectB.id],
    );
    assert.equal(
      await projects.getTechnicalProject({ data: { id: projectB.id }, fetch: clients[0].request }),
      null,
      "user A cannot read user B project",
    );
    assert.equal(
      await projects.updateTechnicalProject({
        data: { id: projectB.id, name: "Tentativa de alteração" },
        fetch: clients[0].request,
      }),
      null,
      "user A cannot update user B project",
    );
    assert.equal(
      (await projects.getTechnicalProject({ data: { id: projectB.id }, fetch: clients[1].request }))
        .name,
      "Projeto técnico B",
      "user B project remains unchanged",
    );

    const refreshed = await auth.refreshCurrentSession({ fetch: clients[0].request });
    assert.equal(
      refreshed.email,
      accounts[0].email,
      "refresh preserves the authenticated identity",
    );
    assert.equal((await auth.signOut({ fetch: clients[0].request })).ok, true, "logout succeeds");
    assert.equal(
      await auth.getCurrentUser({ fetch: clients[0].request }),
      null,
      "logout clears session",
    );
    await assert.rejects(
      () => projects.listTechnicalProjects({ fetch: clients[0].request }),
      /Server Function rejected the request/,
      "logged-out session cannot access protected Server Functions",
    );

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
