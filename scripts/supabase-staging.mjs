import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertLinkedProject, loadStagingConfig } from "./lib/staging-environment.mjs";

function main() {
  const action = process.argv[2];
  const supportedActions = new Set(["check", "plan", "push"]);
  if (!supportedActions.has(action)) {
    throw new Error("Usage: node scripts/supabase-staging.mjs <check|plan|push>");
  }

  const cwd = process.cwd();
  const config = loadStagingConfig(cwd);
  const linkedRefPath = resolve(cwd, "supabase/.temp/project-ref");
  const linkedRef = existsSync(linkedRefPath) ? readFileSync(linkedRefPath, "utf8").trim() : "";
  assertLinkedProject(config.projectRef, linkedRef);

  const migrationStatus = spawnSync("git", ["status", "--porcelain", "--", "supabase/migrations"], {
    cwd,
    encoding: "utf8",
    shell: false,
  });
  if (migrationStatus.status !== 0) {
    throw new Error("Could not verify the Git state of Supabase migrations.");
  }
  if (migrationStatus.stdout.trim()) {
    throw new Error("Remote operations require all migrations to be committed and unchanged.");
  }

  console.log("Environment: staging");
  console.log(`Linked project: ${config.projectRef}`);
  console.log(`Supabase URL: ${config.url}`);
  console.log("Credential class: publishable key only (value intentionally not printed)");

  if (action === "check") {
    console.log("Staging guard passed. No remote command was executed.");
    return;
  }

  const supabaseExecutable =
    process.platform === "win32"
      ? resolve(cwd, "node_modules/.bin/supabase.exe")
      : resolve(cwd, "node_modules/.bin/supabase");

  function runSupabase(args) {
    const result = spawnSync(supabaseExecutable, args, { cwd, stdio: "inherit", shell: false });
    if (result.status !== 0) {
      throw new Error(`Supabase CLI failed: supabase ${args.join(" ")}`);
    }
  }

  function recheckLink() {
    const currentRef = existsSync(linkedRefPath) ? readFileSync(linkedRefPath, "utf8").trim() : "";
    assertLinkedProject(config.projectRef, currentRef);
  }

  console.log("Planning pending remote migrations with --dry-run...");
  runSupabase(["db", "push", "--dry-run"]);

  if (action === "plan") {
    console.log("Dry-run completed. No migration was applied.");
    return;
  }

  const confirmationArgument = `--confirm-project-ref=${config.projectRef}`;
  const expectedEnvironmentConfirmation = `APPLY_TO_STAGING_${config.projectRef}`;
  if (
    !process.argv.includes(confirmationArgument) ||
    process.env.SMART_FINANCE_STAGING_APPLY !== expectedEnvironmentConfirmation
  ) {
    throw new Error(
      `Push refused. Re-run with ${confirmationArgument} and SMART_FINANCE_STAGING_APPLY=${expectedEnvironmentConfirmation}.`,
    );
  }

  recheckLink();
  console.log("Applying committed migrations to the explicitly confirmed staging project...");
  runSupabase(["db", "push"]);
}

try {
  main();
} catch (error) {
  console.error(`Staging operation refused: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
