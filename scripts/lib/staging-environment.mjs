import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const PUBLISHABLE_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]+$/;

export const STAGING_ENV_FILE = ".env.staging.local";
export const STAGING_TEST_ENV_FILE = ".env.staging.test.local";

export function parseEnvText(text, sourceName = "environment file") {
  const values = {};
  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) {
      throw new Error(`${sourceName}:${index + 1} is not a KEY=value entry.`);
    }
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (Object.hasOwn(values, key)) {
      throw new Error(`${sourceName} defines ${key} more than once.`);
    }
    values[key] = value;
  }
  return values;
}

export function readEnvFile(filePath, { optional = false } = {}) {
  try {
    return parseEnvText(readFileSync(filePath, "utf8"), filePath);
  } catch (error) {
    if (optional && error?.code === "ENOENT") return {};
    if (error?.code === "ENOENT") {
      throw new Error(`Missing ${filePath}. Copy its committed .example template first.`);
    }
    throw error;
  }
}

export function validateStagingConfig(values) {
  const environment = values.SMART_FINANCE_REMOTE_ENVIRONMENT;
  const projectRef = values.SUPABASE_STAGING_PROJECT_REF;
  const urlValue = values.VITE_SUPABASE_URL;
  const publishableKey = values.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (environment !== "staging") {
    throw new Error("SMART_FINANCE_REMOTE_ENVIRONMENT must be exactly 'staging'.");
  }
  if (!PROJECT_REF_PATTERN.test(projectRef ?? "")) {
    throw new Error("SUPABASE_STAGING_PROJECT_REF must be a valid 20-character project ref.");
  }

  let url;
  try {
    url = new URL(urlValue);
  } catch {
    throw new Error("VITE_SUPABASE_URL must be a valid hosted Supabase URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== `${projectRef}.supabase.co` ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("VITE_SUPABASE_URL must exactly match the configured staging project ref.");
  }
  if (!PUBLISHABLE_KEY_PATTERN.test(publishableKey ?? "")) {
    throw new Error(
      "Staging requires an sb_publishable_ key; legacy or privileged keys are refused.",
    );
  }

  const forbiddenNames = Object.keys(values).filter((name) =>
    /service[_-]?role|secret[_-]?key|admin[_-]?key|database[_-]?(url|password)|db[_-]?password/i.test(
      name,
    ),
  );
  if (forbiddenNames.length > 0) {
    throw new Error(
      `Privileged values are forbidden in staging env files: ${forbiddenNames.join(", ")}.`,
    );
  }

  return { environment, projectRef, url: url.href, publishableKey };
}

export function assertLinkedProject(expectedRef, linkedRef) {
  if (!linkedRef) {
    throw new Error("No remote Supabase link exists. Linking belongs to Checkpoint 15B.");
  }
  if (linkedRef.trim() !== expectedRef) {
    throw new Error(
      `Linked project mismatch: expected staging ${expectedRef}, found ${linkedRef.trim()}.`,
    );
  }
}

export function loadStagingConfig(cwd = process.cwd()) {
  const filePath = resolve(cwd, STAGING_ENV_FILE);
  return validateStagingConfig(readEnvFile(filePath));
}

export function loadStagingTestCredentials(cwd = process.cwd()) {
  const filePath = resolve(cwd, STAGING_TEST_ENV_FILE);
  const values = readEnvFile(filePath);
  if (values.SMART_FINANCE_RUN_REMOTE_TESTS !== "I_UNDERSTAND_THIS_USES_STAGING") {
    throw new Error("Remote staging tests require the explicit opt-in confirmation value.");
  }
  const accounts = ["A", "B"].map((suffix) => {
    const email = values[`SMART_FINANCE_STAGING_TEST_USER_${suffix}_EMAIL`];
    const password = values[`SMART_FINANCE_STAGING_TEST_USER_${suffix}_PASSWORD`];
    if (!email || !password || password.startsWith("replace-with-")) {
      throw new Error(`Disposable staging account ${suffix} is not configured.`);
    }
    return { email, password };
  });
  if (accounts[0].email === accounts[1].email) {
    throw new Error("Remote RLS validation requires two distinct staging accounts.");
  }
  return accounts;
}
