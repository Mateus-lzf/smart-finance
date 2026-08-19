import assert from "node:assert/strict";
import {
  assertLinkedProject,
  parseEnvText,
  validateStagingConfig,
} from "./lib/staging-environment.mjs";

const valid = {
  SMART_FINANCE_REMOTE_ENVIRONMENT: "staging",
  SUPABASE_STAGING_PROJECT_REF: "abcdefghijklmnopqrst",
  VITE_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example_staging_key",
};

assert.deepEqual(parseEnvText("A=one\nB='two'\n# comment\n"), { A: "one", B: "two" });
assert.equal(validateStagingConfig(valid).projectRef, valid.SUPABASE_STAGING_PROJECT_REF);
assert.doesNotThrow(() =>
  assertLinkedProject(valid.SUPABASE_STAGING_PROJECT_REF, valid.SUPABASE_STAGING_PROJECT_REF),
);

assert.throws(() =>
  validateStagingConfig({ ...valid, SMART_FINANCE_REMOTE_ENVIRONMENT: "production" }),
);
assert.throws(() => validateStagingConfig({ ...valid, SUPABASE_STAGING_PROJECT_REF: "short" }));
assert.throws(() =>
  validateStagingConfig({ ...valid, VITE_SUPABASE_URL: "https://wrongprojectrefxxxx.supabase.co" }),
);
assert.throws(() =>
  validateStagingConfig({ ...valid, VITE_SUPABASE_URL: "http://abcdefghijklmnopqrst.supabase.co" }),
);
assert.throws(() =>
  validateStagingConfig({ ...valid, VITE_SUPABASE_PUBLISHABLE_KEY: "service-role-value" }),
);
assert.throws(() => validateStagingConfig({ ...valid, SUPABASE_SERVICE_ROLE_KEY: "forbidden" }));
assert.throws(() => assertLinkedProject(valid.SUPABASE_STAGING_PROJECT_REF, ""));
assert.throws(() =>
  assertLinkedProject(valid.SUPABASE_STAGING_PROJECT_REF, "zyxwvutsrqponmlkjihg"),
);

console.log("Staging environment guard checks passed without remote access.");
