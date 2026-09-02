import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { createClientRpc } from "@tanstack/start-client-core/client-rpc";
import { runWithStartContext } from "@tanstack/start-storage-context";
import { createServer } from "vite";

const APP_ORIGIN = "http://127.0.0.1:3002";
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
  if (status.status !== 0) throw new Error("Supabase local is unavailable.");
  const values = Object.fromEntries(
    status.stdout
      .split(/\r?\n/)
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^"|"$/g, "")];
      }),
  );
  assert.equal(values.API_URL, "http://127.0.0.1:54321", "tests use local Supabase API");
  assert.ok(values.PUBLISHABLE_KEY);
  assert.ok(values.MAILPIT_URL);
  return values;
}

function createCookieFetch(initialCookies = []) {
  const cookies = new Map(initialCookies);
  const request = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, APP_ORIGIN);
    const headers = new Headers(init.headers);
    headers.set("origin", APP_ORIGIN);
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
      if (typeof serverFunction !== "function" || !serverFunction.serverFnMeta)
        return serverFunction;
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
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      await fetch(`${APP_ORIGIN}/favicon.ico`);
      return;
    } catch {
      await delay(250);
    }
  }
  throw new Error("Local application server did not start.");
}

async function readConfirmation(mailpitUrl, email) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const list = await fetch(`${mailpitUrl}/api/v1/messages`).then((response) => response.json());
    for (const message of (list.messages ?? []).filter((item) =>
      item.To?.some((recipient) => recipient.Address === email),
    )) {
      const detail = await fetch(`${mailpitUrl}/api/v1/message/${message.ID}`).then((response) =>
        response.json(),
      );
      const content = `${detail.Text ?? ""}\n${detail.HTML ?? ""}`.replaceAll("&amp;", "&");
      const match = content.match(/http:\/\/127\.0\.0\.1:3002\/auth\/confirmar\?[^\s"'<>]+/);
      if (!match) continue;
      const url = new URL(match[0]);
      const fragment = new URLSearchParams(url.hash.slice(1));
      const tokenHash = fragment.get("token_hash");
      if (fragment.get("type") === "email" && tokenHash) return tokenHash;
    }
    await delay(250);
  }
  throw new Error("Local confirmation email was not received.");
}

const local = readLocalSupabaseStatus();
const env = {
  ...process.env,
  VITE_SUPABASE_URL: local.API_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY,
  SMART_FINANCE_ENVIRONMENT: "test",
};
const viteBin =
  process.platform === "win32" ? "node_modules\\.bin\\vite.cmd" : "node_modules/.bin/vite";
const devServer = spawn(viteBin, ["--host", "127.0.0.1", "--port", "3002", "--strictPort"], {
  cwd: process.cwd(),
  env,
  stdio: "ignore",
  shell: process.platform === "win32",
});

let vite;
try {
  await waitForServer();
  await Promise.all([
    fetch(`${APP_ORIGIN}/src/lib/auth/auth-functions.ts`),
    fetch(`${APP_ORIGIN}/src/lib/projects/project-functions.ts`),
  ]);
  vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  const auth = createRpcModule(await vite.ssrLoadModule("/src/lib/auth/auth-functions.ts"));
  const projects = createRpcModule(
    await vite.ssrLoadModule("/src/lib/projects/project-functions.ts"),
  );

  await runWithStartContext({ startOptions: {} }, async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const accounts = [
      { email: `delete-a-${suffix}@example.com`, password: "SenhaSeguraA123!" },
      { email: `delete-b-${suffix}@example.com`, password: "SenhaSeguraB123!" },
    ];
    const clients = [createCookieFetch(), createCookieFetch()];

    for (let index = 0; index < accounts.length; index += 1) {
      const signup = await auth.signUp({
        data: { ...accounts[index], next: "/dashboard" },
        fetch: clients[index].request,
      });
      assert.equal(signup.ok, true);
      const tokenHash = await readConfirmation(local.MAILPIT_URL, accounts[index].email);
      assert.equal(
        (
          await auth.verifyEmailToken({
            data: { tokenHash, type: "email" },
            fetch: clients[index].request,
          })
        ).ok,
        true,
      );
    }

    const users = await Promise.all(
      clients.map((client) => auth.getCurrentUser({ fetch: client.request })),
    );
    assert.ok(users[0]?.id && users[1]?.id);
    const projectA = await projects.createRemoteProject({
      data: { name: "Deletion A", type: "Pessoal" },
      fetch: clients[0].request,
    });
    const projectB = await projects.createRemoteProject({
      data: { name: "Deletion B", type: "Pessoal" },
      fetch: clients[1].request,
    });
    assert.equal(projectA.ok, true);
    assert.equal(projectB.ok, true);

    const staleClientA = createCookieFetch(clients[0].cookies);

    const wrongPassword = await clients[0].request("/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "EXCLUIR", password: "SenhaErrada123!" }),
    });
    assert.equal(wrongPassword.status, 401);
    assert.equal((await wrongPassword.json()).error, "invalid_password");
    assert.equal((await auth.getCurrentUser({ fetch: clients[0].request })).id, users[0].id);

    const deleted = await clients[0].request("/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "EXCLUIR", password: accounts[0].password }),
    });
    assert.equal(deleted.status, 200);
    assert.deepEqual(await deleted.json(), { ok: true, redirectTo: "/login" });
    assert.match(deleted.headers.get("cache-control") ?? "", /no-store/);
    assert.equal(await auth.getCurrentUser({ fetch: clients[0].request }), null);
    assert.equal(
      await auth.getCurrentUser({ fetch: staleClientA.request }),
      null,
      "the exact pre-deletion cookie no longer authenticates",
    );
    for (const operation of [
      () => projects.listRemoteProjects({ fetch: staleClientA.request }),
      () =>
        projects.createRemoteProject({
          data: { name: "Must not be recreated", type: "Pessoal" },
          fetch: staleClientA.request,
        }),
      () =>
        projects.updateRemoteProject({
          data: {
            id: projectA.data.project.id,
            expectedVersion: 1,
            input: { name: "Must not update" },
          },
          fetch: staleClientA.request,
        }),
      () =>
        projects.deleteRemoteProject({
          data: { id: projectA.data.project.id, expectedVersion: 1 },
          fetch: staleClientA.request,
        }),
    ]) {
      await assert.rejects(operation, /Server Function rejected/);
    }

    const repeatedDeletion = await clients[0].request("/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "EXCLUIR", password: accounts[0].password }),
    });
    assert.equal(repeatedDeletion.status, 401, "a consecutive deletion fails closed");
    assert.equal((await repeatedDeletion.json()).error, "authentication_required");

    const currentB = await auth.getCurrentUser({ fetch: clients[1].request });
    assert.equal(currentB.id, users[1].id, "account B remains authenticated");
    const projectsB = await projects.listRemoteProjects({ fetch: clients[1].request });
    assert.equal(projectsB.ok, true);
    assert.equal(
      projectsB.data.some(({ project }) => project.id === projectB.data.project.id),
      true,
    );

    console.log("Account deletion real local Auth/RPC/cascade integration passed.");
  });
} finally {
  await vite?.close();
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(devServer.pid), "/t", "/f"], { stdio: "ignore" });
  } else {
    devServer.kill("SIGTERM");
  }
}
