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

async function createFixture(client, ownerUserId, suffix) {
  const created = await client
    .from("projects")
    .insert({ owner_user_id: ownerUserId, name: `staging-smoke-${Date.now()}-${suffix}` })
    .select("id,owner_user_id")
    .single();
  assert.ifError(created.error);
  assert.ok(created.data, `user ${suffix} creates a disposable staging project`);
  return created.data;
}

async function assertCannotAccess(attacker, fixture, attackerLabel, ownerLabel) {
  const readAttempt = await attacker.from("projects").select("id").eq("id", fixture.id);
  assert.ifError(readAttempt.error);
  assert.equal(
    readAttempt.data.length,
    0,
    `user ${attackerLabel} cannot read user ${ownerLabel} project`,
  );

  const updateAttempt = await attacker
    .from("projects")
    .update({ name: `cross-user-update-${attackerLabel}` })
    .eq("id", fixture.id)
    .select("id");
  assert.ifError(updateAttempt.error);
  assert.equal(
    updateAttempt.data.length,
    0,
    `user ${attackerLabel} cannot update user ${ownerLabel} project`,
  );

  const deleteAttempt = await attacker.from("projects").delete().eq("id", fixture.id).select("id");
  assert.ifError(deleteAttempt.error);
  assert.equal(
    deleteAttempt.data.length,
    0,
    `user ${attackerLabel} cannot delete user ${ownerLabel} project`,
  );
}

let fixtureA;
let fixtureB;

try {
  fixtureA = await createFixture(clients[0], users[0].id, "A");
  fixtureB = await createFixture(clients[1], users[1].id, "B");

  await assertCannotAccess(clients[1], fixtureA, "B", "A");
  await assertCannotAccess(clients[0], fixtureB, "A", "B");

  const forgedOwnerByA = await clients[0]
    .from("projects")
    .insert({ owner_user_id: users[1].id, name: "forged-owner-by-a" });
  assert.ok(forgedOwnerByA.error, "user A cannot forge user B owner_user_id");

  const forgedOwnerByB = await clients[1]
    .from("projects")
    .insert({ owner_user_id: users[0].id, name: "forged-owner-by-b" });
  assert.ok(forgedOwnerByB.error, "user B cannot forge user A owner_user_id");
} finally {
  const cleanupTasks = [
    fixtureA
      ? clients[0].from("projects").delete().eq("id", fixtureA.id).select("id")
      : Promise.resolve(null),
    fixtureB
      ? clients[1].from("projects").delete().eq("id", fixtureB.id).select("id")
      : Promise.resolve(null),
  ];
  const cleanupResults = await Promise.allSettled(cleanupTasks);
  const signOutResults = await Promise.allSettled(
    clients.map((supabase) => supabase.auth.signOut()),
  );
  const cleanupErrors = [];

  for (const [index, result] of cleanupResults.entries()) {
    const fixture = index === 0 ? fixtureA : fixtureB;
    if (!fixture) continue;
    if (result.status === "rejected") {
      cleanupErrors.push(new Error(`user ${index === 0 ? "A" : "B"} cleanup request failed`));
      continue;
    }
    if (result.value.error) {
      cleanupErrors.push(new Error(`user ${index === 0 ? "A" : "B"} cleanup was rejected`));
    } else if (result.value.data.length !== 1) {
      cleanupErrors.push(
        new Error(`user ${index === 0 ? "A" : "B"} cleanup did not remove exactly one fixture`),
      );
    }
  }

  for (const [index, result] of signOutResults.entries()) {
    if (result.status === "rejected" || result.value.error) {
      cleanupErrors.push(new Error(`user ${index === 0 ? "A" : "B"} sign-out failed`));
    }
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, "Remote staging fixture cleanup or sign-out failed.");
  }
}

console.log("Opt-in remote staging Auth/RLS matrix passed and removed both technical fixtures.");
