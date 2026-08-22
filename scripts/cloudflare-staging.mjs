import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertBuildArtifacts,
  assertExpectedCloudflareAccount,
  loadCloudflareIdentity,
  readCloudflareConfig,
  STAGING_WORKER_NAME,
  validateCloudflareConfig,
} from "./lib/cloudflare-staging.mjs";
import { assertLinkedProject, loadStagingConfig } from "./lib/staging-environment.mjs";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: options.capture ? "utf8" : undefined,
    stdio: options.capture ? "pipe" : "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    if (options.capture && result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${command} ${args.join(" ")} failed.`);
  }
  return options.capture ? `${result.stdout ?? ""}\n${result.stderr ?? ""}` : "";
}

function assertSupabaseStagingLink(config) {
  const path = resolve("supabase/.temp/project-ref");
  const linkedRef = readFileSync(path, "utf8").trim();
  assertLinkedProject(config.projectRef, linkedRef);
}

function validateLocalDeploymentInputs() {
  const supabase = loadStagingConfig();
  assertSupabaseStagingLink(supabase);
  const wrangler = readCloudflareConfig();
  validateCloudflareConfig(wrangler);
  assertBuildArtifacts();
  return { supabase, wrangler };
}

const wranglerExecutable =
  process.platform === "win32"
    ? resolve("node_modules/.bin/wrangler.exe")
    : resolve("node_modules/.bin/wrangler");

function runLocalPlan() {
  validateLocalDeploymentInputs();
  run(wranglerExecutable, [
    "deploy",
    "--dry-run",
    "--outdir",
    ".wrangler/staging-dry-run",
    "--config",
    "wrangler.jsonc",
    "--env",
    "staging",
  ]);
}

function assertRemoteIdentity() {
  const identity = loadCloudflareIdentity();
  const whoami = run(wranglerExecutable, ["whoami"], { capture: true });
  assertExpectedCloudflareAccount(identity.accountId, whoami);
  return identity;
}

function assertCleanRepository() {
  const status = run("git", ["status", "--porcelain"], { capture: true }).trim();
  if (status) throw new Error("Cloudflare deploy requires a completely clean Git working tree.");
}

function main() {
  const action = process.argv[2];
  if (!new Set(["check", "plan", "deploy"]).has(action)) {
    throw new Error("Usage: node scripts/cloudflare-staging.mjs <check|plan|deploy>");
  }

  if (action === "plan") {
    runLocalPlan();
    console.log("Local Cloudflare staging dry-run passed. Nothing was uploaded.");
    return;
  }

  validateLocalDeploymentInputs();
  const identity = assertRemoteIdentity();
  console.log(`Cloudflare staging account verified for Worker ${identity.workerName}.`);
  if (action === "check") return;

  assertCleanRepository();
  const confirmationArgument = `--confirm-worker=${STAGING_WORKER_NAME}`;
  if (
    !process.argv.includes(confirmationArgument) ||
    process.env.SMART_FINANCE_CLOUDFLARE_DEPLOY !== "DEPLOY_SMART_FINANCE_STAGING"
  ) {
    throw new Error(
      `Deploy refused. Provide ${confirmationArgument} and the one-time SMART_FINANCE_CLOUDFLARE_DEPLOY confirmation.`,
    );
  }

  runLocalPlan();
  assertRemoteIdentity();
  run(wranglerExecutable, ["deploy", "--config", "wrangler.jsonc", "--env", "staging"]);
}

try {
  main();
} catch (error) {
  console.error(
    `Cloudflare staging operation refused: ${error instanceof Error ? error.message : error}`,
  );
  process.exitCode = 1;
}
