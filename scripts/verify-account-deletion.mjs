import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const origin = "https://smart-finance.example";
const user = { id: "10000000-0000-4000-8000-000000000001", email: "owner@example.com" };
const otherUser = { id: "10000000-0000-4000-8000-000000000002", email: "other@example.com" };

function createClient({
  currentUser = user,
  currentError = null,
  reauthenticatedUser = user,
  reauthenticationError = null,
  rpcData = true,
  rpcError = null,
} = {}) {
  const calls = [];
  return {
    calls,
    client: {
      auth: {
        getUser: async (...args) => {
          calls.push(["getUser", ...args]);
          return { data: { user: currentUser }, error: currentError };
        },
        signInWithPassword: async (...args) => {
          calls.push(["signInWithPassword", ...args]);
          return { data: { user: reauthenticatedUser }, error: reauthenticationError };
        },
        signOut: async (...args) => {
          calls.push(["signOut", ...args]);
          return { error: null };
        },
      },
      rpc: async (...args) => {
        calls.push(["rpc", ...args]);
        return { data: rpcData, error: rpcError };
      },
    },
  };
}

function request(body, { method = "POST", requestOrigin = origin } = {}) {
  return new Request(`${origin}/api/account/delete`, {
    method,
    headers: { Origin: requestOrigin, "Content-Type": "application/json" },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
}

async function errorCode(response) {
  return (await response.json()).error;
}

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const server = await vite.ssrLoadModule("/src/lib/account-deletion/account-deletion-server.ts");
  const http = await vite.ssrLoadModule("/src/lib/account-deletion/account-deletion-http.ts");

  const successClient = createClient();
  assert.deepEqual(
    await server.deleteAuthenticatedAccount("SenhaSegura123!", {
      client: successClient.client,
    }),
    { ok: true, redirectTo: "/login" },
  );
  assert.deepEqual(successClient.calls, [
    ["getUser"],
    ["signInWithPassword", { email: user.email, password: "SenhaSegura123!" }],
    ["rpc", "delete_current_account"],
    ["signOut", { scope: "local" }],
  ]);

  const noSession = createClient({ currentUser: null });
  assert.deepEqual(await server.deleteAuthenticatedAccount("x", { client: noSession.client }), {
    ok: false,
    code: "authentication_required",
  });
  assert.equal(
    noSession.calls.some(([name]) => name === "signInWithPassword"),
    false,
  );

  const wrongPassword = createClient({
    reauthenticatedUser: null,
    reauthenticationError: { message: "Invalid login credentials", status: 400 },
  });
  assert.deepEqual(
    await server.deleteAuthenticatedAccount("errada", { client: wrongPassword.client }),
    { ok: false, code: "invalid_password" },
  );
  assert.equal(
    wrongPassword.calls.some(([name]) => name === "rpc"),
    false,
  );

  const mismatch = createClient({ reauthenticatedUser: otherUser });
  assert.deepEqual(await server.deleteAuthenticatedAccount("x", { client: mismatch.client }), {
    ok: false,
    code: "reauthentication_mismatch",
  });
  assert.equal(
    mismatch.calls.some(([name]) => name === "rpc"),
    false,
  );
  assert.deepEqual(mismatch.calls.at(-1), ["signOut", { scope: "local" }]);

  for (const [message, expected] of [
    ["account_deletion_password_reauthentication_required", "password_reauthentication_required"],
    ["account_deletion_password_reauthentication_expired", "password_reauthentication_expired"],
    ["sensitive database detail", "deletion_failed"],
  ]) {
    const failed = createClient({ rpcData: null, rpcError: { code: "P0001", message } });
    assert.deepEqual(await server.deleteAuthenticatedAccount("x", { client: failed.client }), {
      ok: false,
      code: expected,
    });
    assert.equal(
      failed.calls.some(([name]) => name === "signOut"),
      false,
    );
  }

  let receivedPassword = null;
  const response = await http.handleAccountDeletionRequest(
    request({ confirmation: "EXCLUIR", password: "SenhaSegura123!" }),
    {
      deleteAccount: async (password) => {
        receivedPassword = password;
        return { ok: true, redirectTo: "/login" };
      },
    },
  );
  assert.equal(receivedPassword, "SenhaSegura123!");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, redirectTo: "/login" });
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("expires"), "0");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");

  const invalidMethod = await http.handleAccountDeletionRequest(request(null, { method: "GET" }));
  assert.equal(invalidMethod.status, 405);
  assert.equal(await errorCode(invalidMethod), "method_not_allowed");
  const invalidOrigin = await http.handleAccountDeletionRequest(
    request({ confirmation: "EXCLUIR", password: "x" }, { requestOrigin: "https://evil.example" }),
  );
  assert.equal(invalidOrigin.status, 403);
  assert.equal(await errorCode(invalidOrigin), "request_forbidden");
  const missingOrigin = await http.handleAccountDeletionRequest(
    new Request(`${origin}/api/account/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "EXCLUIR", password: "x" }),
    }),
  );
  assert.equal(missingOrigin.status, 403);

  const invalidConfirmation = await http.handleAccountDeletionRequest(
    request({ confirmation: "excluir", password: "x" }),
  );
  assert.equal(invalidConfirmation.status, 400);
  assert.equal(await errorCode(invalidConfirmation), "invalid_confirmation");
  for (const body of [
    { confirmation: "EXCLUIR", password: "x", user_id: otherUser.id },
    { confirmation: "EXCLUIR", password: "x", email: otherUser.email },
    { confirmation: "EXCLUIR", password: "x", owner_user_id: otherUser.id },
  ]) {
    const rejected = await http.handleAccountDeletionRequest(request(body));
    assert.equal(rejected.status, 400);
    assert.equal(await errorCode(rejected), "invalid_request");
  }

  const mappedErrors = [
    ["authentication_required", 401, "authentication_required"],
    ["invalid_password", 401, "invalid_password"],
    ["reauthentication_unavailable", 503, "reauthentication_unavailable"],
    ["reauthentication_mismatch", 503, "reauthentication_unavailable"],
    ["password_reauthentication_required", 409, "password_reauthentication_required"],
    ["password_reauthentication_expired", 409, "password_reauthentication_expired"],
    ["deletion_failed", 503, "account_deletion_failed"],
  ];
  for (const [code, status, publicCode] of mappedErrors) {
    const mapped = await http.handleAccountDeletionRequest(
      request({ confirmation: "EXCLUIR", password: "x" }),
      { deleteAccount: async () => ({ ok: false, code }) },
    );
    assert.equal(mapped.status, status);
    assert.equal(await errorCode(mapped), publicCode);
  }

  const sources = await Promise.all([
    readFile("src/lib/account-deletion/account-deletion-server.ts", "utf8"),
    readFile("src/lib/account-deletion/account-deletion-http.ts", "utf8"),
  ]);
  const joined = sources.join("\n");
  assert.doesNotMatch(joined, /service_role|SUPABASE_SERVICE|admin\.deleteUser/);
  assert.doesNotMatch(joined, /console\.(?:log|error|warn)|localStorage|sessionStorage/);
  assert.doesNotMatch(joined, /refreshSession/);
  assert.match(joined, /signInWithPassword/);
  assert.match(joined, /rpc\("delete_current_account"\)/);

  console.log("Account deletion server orchestration and HTTP boundary passed.");
} finally {
  await vite.close();
}
