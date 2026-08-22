import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";
import {
  assertCloudflareSupabaseConfig,
  assertExpectedCloudflareAccount,
  readCloudflareConfig,
  validateCloudflareConfig,
  validateCloudflareIdentity,
} from "./lib/cloudflare-staging.mjs";

const config = readCloudflareConfig();
const runtimeConfig = validateCloudflareConfig(config);
assert.equal(runtimeConfig.workerName, "smart-finance-staging");
assert.match(runtimeConfig.supabaseUrl, /^https:\/\/[a-z0-9]+\.supabase\.co\/$/);
assert.match(runtimeConfig.supabasePublishableKey, /^sb_publishable_/);
assert.equal(config.preview_urls, false);
assert.equal(config.env.staging.preview_urls, false);
assert.equal(config.env.production, undefined);

const identity = {
  SMART_FINANCE_CLOUDFLARE_ENVIRONMENT: "staging",
  CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  CLOUDFLARE_STAGING_WORKER_NAME: "smart-finance-staging",
};
assert.equal(validateCloudflareIdentity(identity).workerName, "smart-finance-staging");
assert.doesNotThrow(() =>
  assertExpectedCloudflareAccount(identity.CLOUDFLARE_ACCOUNT_ID, identity.CLOUDFLARE_ACCOUNT_ID),
);
assert.throws(() =>
  validateCloudflareIdentity({ ...identity, SMART_FINANCE_CLOUDFLARE_ENVIRONMENT: "production" }),
);
assert.throws(() =>
  validateCloudflareIdentity({ ...identity, CLOUDFLARE_STAGING_WORKER_NAME: "smart-finance" }),
);
assert.throws(() => validateCloudflareIdentity({ ...identity, CLOUDFLARE_API_TOKEN: "forbidden" }));
assert.throws(() =>
  assertExpectedCloudflareAccount(identity.CLOUDFLARE_ACCOUNT_ID, "another account"),
);
assert.throws(() =>
  validateCloudflareConfig({ ...config, env: { ...config.env, production: {} } }),
);
assert.throws(() =>
  validateCloudflareConfig({
    ...config,
    env: {
      ...config.env,
      staging: {
        ...config.env.staging,
        vars: { ...config.env.staging.vars, VITE_SUPABASE_URL: undefined },
      },
    },
  }),
);
assert.throws(() =>
  validateCloudflareConfig({
    ...config,
    env: {
      ...config.env,
      staging: {
        ...config.env.staging,
        vars: { ...config.env.staging.vars, VITE_SUPABASE_PUBLISHABLE_KEY: "service-role-value" },
      },
    },
  }),
);
assert.doesNotThrow(() =>
  assertCloudflareSupabaseConfig(config, {
    url: runtimeConfig.supabaseUrl,
    publishableKey: runtimeConfig.supabasePublishableKey,
  }),
);
assert.throws(() =>
  assertCloudflareSupabaseConfig(config, {
    url: "https://differentprojectref.supabase.co/",
    publishableKey: runtimeConfig.supabasePublishableKey,
  }),
);

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const { sanitizeLogText } = await vite.ssrLoadModule("/src/lib/log-sanitizer.ts");
  const sensitive =
    "authorization: Bearer token-value code=one@example.com&access_token=secret " +
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature user@example.com";
  const sanitized = sanitizeLogText(sensitive);
  assert.doesNotMatch(
    sanitized,
    /token-value|one@example\.com|access_token=secret|user@example\.com|eyJhbGci/,
  );
  assert.match(sanitized, /\[REDACTED\]/);
  assert.match(sanitized, /\[REDACTED_EMAIL\]/);
  assert.match(sanitized, /\[REDACTED_JWT\]/);
} finally {
  await vite.close();
}

const serverSource = await readFile("src/server.ts", "utf8");
assert.match(serverSource, /SMART_FINANCE_ENVIRONMENT/);
assert.match(serverSource, /X-Robots-Tag/);
assert.ok(serverSource.includes("Disallow: /\\n"));

const browserClientSource = await readFile("src/lib/supabase/browser-client.ts", "utf8");
const serverClientSource = await readFile("src/lib/supabase/server-client.ts", "utf8");
assert.match(browserClientSource, /readPublicSupabaseEnv\(\)/);
assert.match(serverClientSource, /readPublicSupabaseEnv\(process\.env\)/);

console.log("Cloudflare staging config, guards, log redaction and indexing checks passed locally.");
