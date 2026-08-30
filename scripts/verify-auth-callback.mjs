import assert from "node:assert/strict";
import { createServerClient } from "@supabase/ssr";
import { createServer } from "vite";

const SUPABASE_URL = "https://abcdefghijklmnopqrst.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_callback_test";
const FLOW_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const consumedTokenHashes = new Set();

const user = {
  id: "00000000-0000-0000-0000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "callback+smartfinance17e@example.test",
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
    if (url.includes("/verify")) {
      const body = JSON.parse(String(init.body ?? "{}"));
      if (body.token_hash === "expired-token" || consumedTokenHashes.has(body.token_hash)) {
        return Response.json(
          { code: "otp_expired", msg: "Token has expired or is invalid" },
          { status: 403 },
        );
      }
      consumedTokenHashes.add(body.token_hash);
      return Response.json({
        access_token: "header.payload.signature",
        refresh_token: `refresh-${body.token_hash}`,
        expires_in: 3600,
        token_type: "bearer",
        user,
      });
    }
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
  options: { emailRedirectTo: "http://localhost:3000/auth/confirmar?next=%2Fdashboard" },
});
const signupCallback = callbackFromRequest(requests.at(-1));
assert.equal(signupCallback.origin, "http://localhost:3000");
assert.equal(signupCallback.pathname, "/auth/confirmar");
assert.equal(signupCallback.searchParams.get("next"), "/dashboard");
assert.match(
  signupCallback.searchParams.get("sb_flow_id") ?? "",
  FLOW_ID_PATTERN,
  "PKCE correlation remains available for other flows",
);

await client.auth.resetPasswordForEmail(user.email, {
  redirectTo:
    "https://smart-finance-staging.smartfinance-lab.workers.dev/auth/confirmar?next=%2Fredefinir-senha",
});
const recoveryCallback = callbackFromRequest(requests.at(-1));
assert.equal(recoveryCallback.origin, "https://smart-finance-staging.smartfinance-lab.workers.dev");
assert.equal(recoveryCallback.searchParams.get("next"), "/redefinir-senha");
assert.equal(recoveryCallback.pathname, "/auth/confirmar");

const crossContextSignup = createCallbackHarness();
const signupVerification = await crossContextSignup.client.auth.verifyOtp({
  token_hash: "signup-token",
  type: "email",
});
assert.ifError(signupVerification.error);
assert.equal(signupVerification.data.user?.email, user.email);

const reusedContext = createCallbackHarness();
const reusedVerification = await reusedContext.client.auth.verifyOtp({
  token_hash: "signup-token",
  type: "email",
});
assert.ok(reusedVerification.error, "a token cannot become a second session");

const expiredContext = createCallbackHarness();
const expiredVerification = await expiredContext.client.auth.verifyOtp({
  token_hash: "expired-token",
  type: "email",
});
assert.ok(
  expiredVerification.error,
  "expired token is rejected instead of becoming a false success",
);

const crossContextRecovery = createCallbackHarness();
const recoveryVerification = await crossContextRecovery.client.auth.verifyOtp({
  token_hash: "recovery-token",
  type: "recovery",
});
assert.ifError(recoveryVerification.error);

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
  "Cross-context Auth email tokens, explicit verification, expiry, reuse and safe redirects passed locally.",
);
