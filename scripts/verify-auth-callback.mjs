import assert from "node:assert/strict";
import { createServerClient } from "@supabase/ssr";
import { createServer } from "vite";

const SUPABASE_URL = "https://abcdefghijklmnopqrst.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_callback_test";
const FLOW_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

const user = {
  id: "00000000-0000-0000-0000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "callback@example.test",
  app_metadata: {},
  user_metadata: {},
  identities: [],
  created_at: new Date(0).toISOString(),
};

function createCallbackHarness() {
  const cookies = new Map();
  const requests = [];
  const syntheticFetch = async (input, init = {}) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.includes("/signup")) return Response.json(user);
    if (url.includes("/recover")) return Response.json({});
    if (url.includes("/token?grant_type=pkce")) {
      const body = JSON.parse(String(init.body ?? "{}"));
      if (body.auth_code === "expired-code") {
        return Response.json(
          { code: "flow_state_expired", msg: "Auth code has expired" },
          { status: 400 },
        );
      }
      return Response.json({
        access_token: "header.payload.signature",
        refresh_token: `refresh-${body.auth_code}`,
        expires_in: 3600,
        token_type: "bearer",
        user,
      });
    }
    throw new Error(`Unexpected synthetic Auth request: ${url}`);
  };

  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    global: { fetch: syntheticFetch },
    auth: { experimental: { appendPkceFlowIdToRedirects: true } },
    cookies: {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      setAll: (changes) => {
        for (const { name, value, options } of changes) {
          if (!value || options?.maxAge === 0) cookies.delete(name);
          else cookies.set(name, value);
        }
      },
    },
  });
  return { client, requests };
}

function callbackFromRequest(request) {
  const redirectTo = new URL(request.url).searchParams.get("redirect_to");
  assert.ok(redirectTo, "Auth request includes redirect_to");
  return new URL(redirectTo);
}

const { client, requests } = createCallbackHarness();
await client.auth.signUp({
  email: user.email,
  password: "SenhaSegura123!",
  options: { emailRedirectTo: "http://localhost:3000/auth/callback?next=%2Fdashboard" },
});
const signupCallback = callbackFromRequest(requests.at(-1));
assert.equal(signupCallback.origin, "http://localhost:3000");
assert.equal(signupCallback.pathname, "/auth/callback");
assert.equal(signupCallback.searchParams.get("next"), "/dashboard");
const signupFlowId = signupCallback.searchParams.get("sb_flow_id");
assert.match(signupFlowId ?? "", FLOW_ID_PATTERN, "signup carries its PKCE flow id");

await client.auth.resetPasswordForEmail(user.email, {
  redirectTo:
    "https://smart-finance-staging.smartfinance-lab.workers.dev/auth/callback?next=%2Fredefinir-senha",
});
const recoveryCallback = callbackFromRequest(requests.at(-1));
assert.equal(recoveryCallback.origin, "https://smart-finance-staging.smartfinance-lab.workers.dev");
assert.equal(recoveryCallback.searchParams.get("next"), "/redefinir-senha");
const recoveryFlowId = recoveryCallback.searchParams.get("sb_flow_id");
assert.match(recoveryFlowId ?? "", FLOW_ID_PATTERN, "recovery carries its PKCE flow id");
assert.notEqual(signupFlowId, recoveryFlowId, "overlapping email flows have distinct identifiers");

const signupExchange = await client.auth.exchangeCodeForSession("signup-code", {
  flowId: signupFlowId,
});
assert.ifError(signupExchange.error);
assert.equal(signupExchange.data.redirectType, null);

const reusedExchange = await client.auth.exchangeCodeForSession("signup-code", {
  flowId: signupFlowId,
});
assert.equal(reusedExchange.error?.name, "AuthPKCECodeVerifierMissingError");

const expiredHarness = createCallbackHarness();
await expiredHarness.client.auth.signUp({
  email: user.email,
  password: "SenhaSegura123!",
  options: { emailRedirectTo: "http://localhost:3000/auth/callback" },
});
const expiredFlowId = callbackFromRequest(expiredHarness.requests.at(-1)).searchParams.get(
  "sb_flow_id",
);
const expiredExchange = await expiredHarness.client.auth.exchangeCodeForSession("expired-code", {
  flowId: expiredFlowId,
});
assert.ok(
  expiredExchange.error,
  "expired callback is rejected instead of becoming a false success",
);

const recoveryExchange = await client.auth.exchangeCodeForSession("recovery-code", {
  flowId: recoveryFlowId,
});
assert.ifError(recoveryExchange.error);
assert.equal(recoveryExchange.data.redirectType, "recovery");

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const { sanitizeInternalRedirect } = await vite.ssrLoadModule("/src/lib/auth/safe-redirect.ts");
  assert.equal(sanitizeInternalRedirect("/dados?pagina=2"), "/dados?pagina=2");
  assert.equal(sanitizeInternalRedirect("/"), "/dashboard");
  assert.equal(sanitizeInternalRedirect("/?utm_source=email"), "/dashboard");
  assert.equal(sanitizeInternalRedirect("https://evil.example"), "/dashboard");
  assert.equal(sanitizeInternalRedirect("//evil.example"), "/dashboard");
} finally {
  await vite.close();
}

console.log(
  "Auth email callbacks, PKCE flow correlation, expiry, reuse and safe redirects passed locally.",
);
