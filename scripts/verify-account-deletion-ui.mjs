import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });

function jsonResponse(status, body) {
  return Response.json(body, { status });
}

try {
  const client = await vite.ssrLoadModule("/src/lib/account-deletion/account-deletion-client.ts");
  const activeProject = await vite.ssrLoadModule("/src/lib/active-project-preference.ts");

  const values = new Map([
    ["smart-finance.active-project.v1.user.account-a", "project-a"],
    ["smart-finance.active-project.v1.user.account-b", "project-b"],
    ["smart-finance.theme", "dark"],
    ["smart-finance.local-state.v2", "legacy-global"],
  ]);
  const removedKeys = [];
  const storage = {
    removeItem(key) {
      removedKeys.push(key);
      values.delete(key);
    },
  };
  activeProject.removeBrowserActiveProjectPreference("account-a", storage);
  assert.deepEqual(removedKeys, ["smart-finance.active-project.v1.user.account-a"]);
  assert.equal(values.has("smart-finance.active-project.v1.user.account-a"), false);
  assert.equal(values.get("smart-finance.active-project.v1.user.account-b"), "project-b");
  assert.equal(values.get("smart-finance.theme"), "dark");
  assert.equal(values.get("smart-finance.local-state.v2"), "legacy-global");

  const requests = [];
  const success = await client.deleteCurrentAccount("EXCLUIR", "senha-ficticia", {
    fetch: async (...args) => {
      requests.push(args);
      return jsonResponse(200, { ok: true, redirectTo: "/login" });
    },
  });
  assert.deepEqual(success, { redirectTo: "/login" });
  assert.equal(client.canSubmitAccountDeletion("EXCLUIR", "senha", false), true);
  assert.equal(client.canSubmitAccountDeletion(" excluir ", "senha", false), false);
  assert.equal(client.canSubmitAccountDeletion("EXCLUIR", "", false), false);
  assert.equal(client.canSubmitAccountDeletion("EXCLUIR", "senha", true), false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0][0], "/api/account/delete");
  assert.deepEqual(requests[0][1], {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ confirmation: "EXCLUIR", password: "senha-ficticia" }),
  });
  assert.deepEqual(Object.keys(JSON.parse(requests[0][1].body)).sort(), [
    "confirmation",
    "password",
  ]);
  assert.doesNotMatch(JSON.stringify(requests), /user_id|owner_user_id|email|token/i);

  for (const [status, serverCode, clientCode] of [
    [401, "invalid_password", "INVALID_PASSWORD"],
    [401, "authentication_required", "AUTHENTICATION_REQUIRED"],
    [400, "invalid_confirmation", "INVALID_CONFIRMATION"],
    [409, "password_reauthentication_required", "REAUTHENTICATION_REQUIRED"],
    [409, "password_reauthentication_expired", "REAUTHENTICATION_EXPIRED"],
    [503, "reauthentication_unavailable", "REAUTHENTICATION_UNAVAILABLE"],
    [403, "request_forbidden", "REQUEST_FORBIDDEN"],
    [503, "account_deletion_failed", "UNAVAILABLE"],
  ]) {
    await assert.rejects(
      client.deleteCurrentAccount("EXCLUIR", "senha", {
        fetch: async () => jsonResponse(status, { error: serverCode, details: "internal" }),
      }),
      (error) => error instanceof client.AccountDeletionClientError && error.code === clientCode,
    );
  }

  await assert.rejects(
    client.deleteCurrentAccount("EXCLUIR", "senha", {
      fetch: async () => jsonResponse(200, { ok: true, redirectTo: "https://example.com" }),
    }),
    (error) =>
      error instanceof client.AccountDeletionClientError && error.code === "INVALID_RESPONSE",
  );
  await assert.rejects(
    client.deleteCurrentAccount("EXCLUIR", "senha", {
      fetch: async () => {
        throw new Error("network details must not escape");
      },
    }),
    (error) => error instanceof client.AccountDeletionClientError && error.code === "NETWORK",
  );

  const [settings, component, clientSource] = await Promise.all([
    readFile("src/routes/_authenticated/configuracoes.tsx", "utf8"),
    readFile("src/components/account/account-deletion.tsx", "utf8"),
    readFile("src/lib/account-deletion/account-deletion-client.ts", "utf8"),
  ]);
  assert.match(settings, /financialMode === ["']remote["'] && <AccountDeletion \/>/);
  assert.match(settings, /AccountDataExport/);
  assert.match(settings, /<Panel title=["']Tema["'][\s\S]*<AccountDeletion \/>/);
  assert.match(component, /const \[open, setOpen\] = useState\(false\)/);
  assert.match(component, /Digite EXCLUIR para confirmar/);
  assert.match(clientSource, /confirmation === ["']EXCLUIR["']/);
  assert.match(clientSource, /password\.length > 0/);
  assert.match(component, /if \(submittingRef\.current\) return/);
  assert.match(component, /type=["']password["']/);
  assert.match(component, /autoComplete=["']current-password["']/);
  assert.match(component, /disabled=\{!canSubmit\}/);
  assert.match(component, /clearSensitiveState\(\)/);
  assert.match(component, /aria-live=["']polite["']/);
  assert.match(component, /max-h-\[calc\(100dvh-2rem\)\]/);
  assert.match(component, /window\.location\.assign\(result\.redirectTo\)/);
  assert.match(
    component,
    /await deleteCurrentAccount\(confirmation, password\);[\s\S]*removeBrowserActiveProjectPreference\(user\.id\);[\s\S]*window\.location\.assign\(result\.redirectTo\)/,
  );
  assert.equal((component.match(/removeBrowserActiveProjectPreference\(/g) ?? []).length, 1);
  assert.match(component, /A senha informada está incorreta/);
  assert.doesNotMatch(`${component}\n${clientSource}`, /localStorage|sessionStorage|indexedDB/i);
  assert.doesNotMatch(component, /console\.|Supabase|service_role|SQL|token/i);

  console.log("Account deletion client and destructive settings UI contract passed.");
} finally {
  await vite.close();
}
