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

async function consumeAuthEmail(mailpitUrl, email, expectedType) {
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
      const match = content.match(/https?:\/\/127\.0\.0\.1:54321\/auth\/v1\/verify\?[^\s"'<>]+/);
      if (!match) continue;
      const verificationUrl = new URL(match[0]);
      if (verificationUrl.searchParams.get("type") !== expectedType) continue;
      const verified = await fetch(match[0], { redirect: "manual" });
      assert.ok([302, 303].includes(verified.status), `${expectedType} verification succeeds`);
      const redirectLocation = verified.headers.get("location");
      assert.ok(redirectLocation, `${expectedType} verification returns an application callback`);
      return redirectLocation;
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

  await runWithStartContext({ startOptions: {} }, async () => {
    const runtimeSources = await Promise.all([
      readFile("src/lib/auth/auth-functions.ts", "utf8"),
      readFile("src/lib/auth/auth-server.ts", "utf8"),
      readFile("src/lib/projects/project-functions.ts", "utf8"),
      readFile("src/lib/projects/supabase-project-store.ts", "utf8"),
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
      const callbackUrl = await consumeAuthEmail(local.MAILPIT_URL, account.email, "signup");
      assert.match(
        new URL(callbackUrl, APP_ORIGIN).searchParams.get("sb_flow_id") ?? "",
        /^[A-Za-z0-9_-]{8,64}$/,
        "signup callback carries the PKCE flow identifier",
      );
      const callbackResponse = await clients[index].request(callbackUrl);
      assert.ok(
        [302, 307].includes(callbackResponse.status),
        "PKCE callback redirects after exchange",
      );
      const callbackDestination = new URL(callbackResponse.headers.get("location"), APP_ORIGIN);
      assert.equal(
        callbackDestination.pathname,
        index === 0 ? "/dashboard" : "/dados",
        "callback uses only the sanitized internal destination",
      );
      const confirmedUser = await auth.getCurrentUser({ fetch: clients[index].request });
      assert.equal(confirmedUser.email, account.email, "PKCE callback establishes the session");
      const reusedCallback = await clients[index].request(callbackUrl);
      assert.ok([302, 307].includes(reusedCallback.status), "reused callback is handled safely");
      const reusedDestination = new URL(reusedCallback.headers.get("location"), APP_ORIGIN);
      assert.equal(reusedDestination.pathname, "/login");
      assert.equal(reusedDestination.searchParams.get("authError"), "invalid_callback");
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
    await assert.rejects(
      () => projects.listRemoteProjects({ fetch: invalidSession.request }),
      /Server Function rejected the request/,
      "invalid session cannot access protected Server Functions",
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

    assert.deepEqual(
      await projects.deleteRemoteProject({
        data: { id: projectA.project.id, expectedVersion: 2 },
        fetch: clients[0].request,
      }),
      { ok: true, data: null },
    );
    assert.deepEqual(
      await projects.deleteRemoteProject({
        data: { id: projectB.project.id, expectedVersion: 1 },
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
    const recoveryCallbackUrl = await consumeAuthEmail(
      local.MAILPIT_URL,
      accounts[1].email,
      "recovery",
    );
    assert.match(
      new URL(recoveryCallbackUrl, APP_ORIGIN).searchParams.get("sb_flow_id") ?? "",
      /^[A-Za-z0-9_-]{8,64}$/,
      "recovery callback carries the PKCE flow identifier",
    );
    const recoveryCallback = await recoveryClient.request(recoveryCallbackUrl);
    assert.ok(
      [302, 307].includes(recoveryCallback.status),
      "recovery callback exchanges PKCE code",
    );
    assert.equal(
      new URL(recoveryCallback.headers.get("location"), APP_ORIGIN).pathname,
      "/redefinir-senha",
    );
    const replacementPassword = "NovaSenhaSeguraB456!";
    assert.equal(
      (
        await auth.updateRecoveredPassword({
          data: { password: replacementPassword },
          fetch: recoveryClient.request,
        })
      ).ok,
      true,
      "authenticated recovery session can redefine the password",
    );
    await auth.signOut({ fetch: recoveryClient.request });
    assert.deepEqual(
      await auth.signIn({
        data: { email: accounts[1].email, password: accounts[1].password },
        fetch: recoveryClient.request,
      }),
      { ok: false, code: "invalid_credentials" },
      "old password no longer authenticates",
    );
    assert.equal(
      (
        await auth.signIn({
          data: { email: accounts[1].email, password: replacementPassword },
          fetch: recoveryClient.request,
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

    const routeSources = await Promise.all([
      readFile("src/routes/_authenticated.tsx", "utf8"),
      readFile("src/routes/__root.tsx", "utf8"),
      readFile("src/lib/auth/auth-provider.tsx", "utf8"),
      readFile("src/components/app/app-shell.tsx", "utf8"),
      readFile("src/routes/_authenticated/configuracoes.tsx", "utf8"),
    ]);
    assert.doesNotMatch(
      routeSources.join("\n"),
      /project-functions|RemoteProjectRepository|\.from\(["'](?:transactions|projects|import_profiles|import_runs)["']\)/,
      "product routes do not connect the technical remote vertical or financial tables",
    );
    assert.doesNotMatch(
      routeSources.join("\n"),
      /localStorage|STORAGE_KEY|smart-finance-state/,
      "authentication UI does not directly manipulate financial localStorage",
    );
    assert.match(
      routeSources[0],
      /<AppProvider key=\{user\.id\} userId=\{user\.id\}>/,
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
      const authenticatedCookieHeader = [...recoveryClient.cookies]
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
