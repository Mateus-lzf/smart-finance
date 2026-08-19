import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  assertLinkedProject,
  loadStagingConfig,
  loadStagingTestCredentials,
} from "./lib/staging-environment.mjs";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const config = loadStagingConfig();
const accounts = loadStagingTestCredentials();
const linkedRefPath = resolve("supabase/.temp/project-ref");
assertLinkedProject(
  config.projectRef,
  existsSync(linkedRefPath) ? readFileSync(linkedRefPath, "utf8").trim() : "",
);

function client() {
  return createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

const anonymous = client();
const anonymousProjects = await anonymous.from("projects").select("id").limit(1);
assert.ok(anonymousProjects.error, "anonymous access to projects is rejected");

const clients = [client(), client()];
const users = [];
for (let index = 0; index < clients.length; index += 1) {
  const { data, error } = await clients[index].auth.signInWithPassword(accounts[index]);
  assert.ifError(error);
  assert.ok(data.user, `staging user ${index + 1} signs in`);
  users.push(data.user);
}
assert.notEqual(users[0].id, users[1].id, "RLS test users are distinct");

const projectName = `staging-smoke-${Date.now()}`;
const created = await clients[0]
  .from("projects")
  .insert({ owner_user_id: users[0].id, name: projectName })
  .select("id,owner_user_id")
  .single();
assert.ifError(created.error);
assert.ok(created.data, "user A creates a disposable staging project");

try {
  const invisibleToB = await clients[1].from("projects").select("id").eq("id", created.data.id);
  assert.ifError(invisibleToB.error);
  assert.equal(invisibleToB.data.length, 0, "user B cannot read user A project");

  const forgedOwner = await clients[1]
    .from("projects")
    .insert({ owner_user_id: users[0].id, name: "forged-owner" });
  assert.ok(forgedOwner.error, "user B cannot trust or forge owner_user_id");

  const updateByB = await clients[1]
    .from("projects")
    .update({ name: "cross-user-update" })
    .eq("id", created.data.id)
    .select("id");
  assert.ifError(updateByB.error);
  assert.equal(updateByB.data.length, 0, "user B cannot update user A project");
} finally {
  const cleanup = await clients[0].from("projects").delete().eq("id", created.data.id);
  assert.ifError(cleanup.error);
  await Promise.all(clients.map((supabase) => supabase.auth.signOut()));
}

console.log("Opt-in remote staging Auth/RLS smoke test passed and removed its technical fixture.");
