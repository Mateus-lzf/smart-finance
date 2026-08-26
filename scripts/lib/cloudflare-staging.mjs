import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readEnvFile } from "./staging-environment.mjs";

export const CLOUDFLARE_STAGING_ENV_FILE = ".env.cloudflare.staging.local";
export const STAGING_WORKER_NAME = "smart-finance-staging";
const ACCOUNT_ID_PATTERN = /^[a-f0-9]{32}$/;

export function validateCloudflareConfig(config) {
  if (config.name !== "smart-finance") {
    throw new Error("The base Worker name must be exactly smart-finance.");
  }
  if (config.main !== "src/cloudflare-worker.mjs") {
    throw new Error("Wrangler must deploy the reviewed Cloudflare staging wrapper entrypoint.");
  }
  if (config.workers_dev !== false || config.preview_urls !== false) {
    throw new Error("The base Worker must not expose workers.dev or preview URLs.");
  }
  if (Object.hasOwn(config.env ?? {}, "production")) {
    throw new Error("Checkpoint 15D must not define a production environment.");
  }

  const staging = config.env?.staging;
  if (!staging || staging.name !== STAGING_WORKER_NAME) {
    throw new Error(`The staging Worker must be named ${STAGING_WORKER_NAME}.`);
  }
  if (staging.workers_dev !== true || staging.preview_urls !== false) {
    throw new Error("Staging requires workers.dev and must disable preview URLs.");
  }
  if (staging.vars?.SMART_FINANCE_ENVIRONMENT !== "staging") {
    throw new Error("The Worker runtime environment must be exactly staging.");
  }
  let supabaseUrl;
  try {
    supabaseUrl = new URL(staging.vars?.VITE_SUPABASE_URL);
  } catch {
    throw new Error("The staging Worker requires a valid VITE_SUPABASE_URL runtime binding.");
  }
  if (supabaseUrl.protocol !== "https:" || !supabaseUrl.hostname.endsWith(".supabase.co")) {
    throw new Error(
      "The staging Worker Supabase URL must use HTTPS and the Supabase hosted domain.",
    );
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(staging.vars?.VITE_SUPABASE_PUBLISHABLE_KEY ?? "")) {
    throw new Error("The staging Worker requires only an sb_publishable_ Supabase key.");
  }
  if (config.assets?.directory !== ".output/public" || config.assets?.binding !== "ASSETS") {
    throw new Error("Wrangler static assets must point to the Nitro public output.");
  }
  if (
    !Array.isArray(config.assets?.run_worker_first) ||
    config.assets.run_worker_first.length !== 1 ||
    config.assets.run_worker_first[0] !== "/robots.txt"
  ) {
    throw new Error("Only /robots.txt must run through the staging Worker before static assets.");
  }
  if (!(config.compatibility_flags ?? []).includes("nodejs_compat")) {
    throw new Error("The current Nitro output requires nodejs_compat.");
  }
  return {
    workerName: staging.name,
    environment: staging.vars.SMART_FINANCE_ENVIRONMENT,
    supabaseUrl: supabaseUrl.href,
    supabasePublishableKey: staging.vars.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
}

export function assertCloudflareSupabaseConfig(cloudflare, supabase) {
  const runtime = validateCloudflareConfig(cloudflare);
  if (
    runtime.supabaseUrl !== supabase.url ||
    runtime.supabasePublishableKey !== supabase.publishableKey
  ) {
    throw new Error(
      "Cloudflare staging Supabase bindings do not match the approved staging environment.",
    );
  }
}

export function readCloudflareConfig(cwd = process.cwd()) {
  const path = resolve(cwd, "wrangler.jsonc");
  try {
    const jsonc = readFileSync(path, "utf8");
    return JSON.parse(jsonc.replace(/,\s*([}\]])/g, "$1"));
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error("Missing versioned wrangler.jsonc.");
    throw new Error(`Invalid wrangler.jsonc: ${error instanceof Error ? error.message : error}`);
  }
}

export function validateCloudflareIdentity(values) {
  if (values.SMART_FINANCE_CLOUDFLARE_ENVIRONMENT !== "staging") {
    throw new Error("SMART_FINANCE_CLOUDFLARE_ENVIRONMENT must be exactly staging.");
  }
  if (values.CLOUDFLARE_STAGING_WORKER_NAME !== STAGING_WORKER_NAME) {
    throw new Error(`CLOUDFLARE_STAGING_WORKER_NAME must be exactly ${STAGING_WORKER_NAME}.`);
  }
  if (!ACCOUNT_ID_PATTERN.test(values.CLOUDFLARE_ACCOUNT_ID ?? "")) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID must be a valid 32-character account ID.");
  }

  const forbiddenNames = Object.keys(values).filter((name) =>
    /api[_-]?token|api[_-]?key|secret|password|service[_-]?role|database[_-]?url/i.test(name),
  );
  if (forbiddenNames.length > 0) {
    throw new Error(
      `Cloudflare application env files cannot contain credentials: ${forbiddenNames.join(", ")}.`,
    );
  }
  return {
    environment: values.SMART_FINANCE_CLOUDFLARE_ENVIRONMENT,
    accountId: values.CLOUDFLARE_ACCOUNT_ID,
    workerName: values.CLOUDFLARE_STAGING_WORKER_NAME,
  };
}

export function loadCloudflareIdentity(cwd = process.cwd()) {
  return validateCloudflareIdentity(readEnvFile(resolve(cwd, CLOUDFLARE_STAGING_ENV_FILE)));
}

export function assertBuildArtifacts(cwd = process.cwd()) {
  const required = [".output/server/index.mjs", ".output/public"];
  const missing = required.filter((path) => !existsSync(resolve(cwd, path)));
  if (missing.length > 0) {
    throw new Error(`Missing staging build artifacts: ${missing.join(", ")}.`);
  }
}

export function assertExpectedCloudflareAccount(expectedAccountId, whoamiOutput) {
  const normalized = whoamiOutput.toLowerCase();
  if (!normalized.includes(expectedAccountId.toLowerCase())) {
    throw new Error(
      "The authenticated Wrangler account does not match the approved staging account.",
    );
  }
}
