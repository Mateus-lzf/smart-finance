import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
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

function client(options = {}) {
  return createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...options,
  });
}

const anonymous = client();
const invalidSession = client({
  global: { headers: { Authorization: "Bearer invalid-staging-test-session" } },
});
const clients = [client(), client()];
const users = [];
const runMarker = randomUUID().slice(0, 8);
const prefixes = [`sf-d3-${runMarker}-a`, `sf-d3-${runMarker}-b`];
const knownProjectIds = [new Set(), new Set()];

function fileHash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function profile() {
  return {
    headers: ["Data", "Descrição", "Categoria", "Tipo", "Valor", "Filial"],
    columns: [
      { id: "date", header: "Data", index: 0 },
      { id: "description", header: "Descrição", index: 1 },
      { id: "category", header: "Categoria", index: 2 },
      { id: "type", header: "Tipo", index: 3 },
      { id: "amount", header: "Valor", index: 4 },
      { id: "branch", header: "Filial", index: 5 },
    ],
    mapping: {
      date: "date",
      description: "description",
      category: "category",
      type: "type",
      amount: "amount",
    },
  };
}

function importedRow(overrides = {}) {
  return {
    date: "2026-08-05",
    description: "Importado de teste",
    category: "Categoria fictícia",
    type: "despesa",
    amount: 100.25,
    additional_data: { branch: "Filial teste" },
    ...overrides,
  };
}

async function signIn() {
  for (let index = 0; index < clients.length; index += 1) {
    const { data, error } = await clients[index].auth.signInWithPassword(accounts[index]);
    assert.ifError(error);
    assert.ok(data.user, `disposable user ${index + 1} signs in`);
    users.push(data.user);
  }
  assert.notEqual(users[0].id, users[1].id, "test users are distinct");
}

async function workspace(supabase) {
  const result = await supabase.rpc("load_financial_workspace");
  assert.ifError(result.error);
  assert.ok(result.data && typeof result.data === "object" && !Array.isArray(result.data));
  return result.data;
}

async function createProject(index, suffix) {
  const result = await clients[index]
    .from("projects")
    .insert({ owner_user_id: users[index].id, name: `${prefixes[index]}-${suffix}` })
    .select("id,owner_user_id,name,version")
    .single();
  assert.ifError(result.error);
  assert.ok(result.data);
  knownProjectIds[index].add(result.data.id);
  return result.data;
}

async function createTransaction(supabase, projectId, input) {
  const result = await supabase
    .rpc("create_financial_transaction", { p_project_id: projectId, p_input: input })
    .single();
  assert.ifError(result.error);
  assert.ok(result.data);
  return result.data;
}

async function assertCrossProjectIsolation(attacker, fixture, label) {
  const read = await attacker.from("projects").select("id").eq("id", fixture.id);
  assert.ifError(read.error);
  assert.equal(read.data.length, 0, `${label}: cross-read returns no rows`);
  const update = await attacker
    .from("projects")
    .update({ name: `${prefixes[0]}-forbidden-update` })
    .eq("id", fixture.id)
    .select("id");
  assert.ifError(update.error);
  assert.equal(update.data.length, 0, `${label}: cross-update returns no rows`);
  const deletion = await attacker.from("projects").delete().eq("id", fixture.id).select("id");
  assert.ifError(deletion.error);
  assert.equal(deletion.data.length, 0, `${label}: cross-delete returns no rows`);
}

async function assertCrossTransactionIsolation(attacker, fixture, label) {
  const read = await attacker.from("transactions").select("id").eq("id", fixture.id);
  assert.ifError(read.error);
  assert.equal(read.data.length, 0, `${label}: cross transaction read returns no rows`);
  const update = await attacker.rpc("update_financial_transaction", {
    p_project_id: fixture.project_id,
    p_transaction_id: fixture.id,
    p_expected_version: fixture.version,
    p_input: { description: "Alteração proibida" },
  });
  assert.ok(update.error?.message.includes("project_not_found"), `${label}: update is not found`);
  const deletion = await attacker.rpc("delete_financial_transaction", {
    p_project_id: fixture.project_id,
    p_transaction_id: fixture.id,
    p_expected_version: fixture.version,
  });
  assert.ok(deletion.error?.message.includes("project_not_found"), `${label}: delete is not found`);
}

async function projectState(supabase, projectId) {
  const [project, transactions, runCount, profileRow] = await Promise.all([
    supabase.from("projects").select("id,version").eq("id", projectId).single(),
    supabase
      .from("transactions")
      .select(
        "id,date,description,category,type,amount,origin,manually_modified,additional_data,version",
      )
      .eq("project_id", projectId)
      .order("id"),
    supabase
      .from("import_runs")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId),
    supabase
      .from("import_profiles")
      .select("headers,columns,mapping,schema_version")
      .eq("project_id", projectId)
      .single(),
  ]);
  assert.ifError(project.error);
  assert.ifError(transactions.error);
  assert.ifError(runCount.error);
  assert.ifError(profileRow.error);
  return {
    projectVersion: project.data.version,
    transactions: transactions.data,
    runCount: runCount.count,
    profile: profileRow.data,
  };
}

async function cleanupOwner(index) {
  if (!users[index]) return;
  const supabase = clients[index];
  const found = await supabase.from("projects").select("id").like("name", `${prefixes[index]}-%`);
  if (found.error) throw new Error(`owner ${index + 1} cleanup discovery failed`);
  for (const row of found.data) knownProjectIds[index].add(row.id);
  const ids = [...knownProjectIds[index]];
  if (found.data.length > 0) {
    const removed = await supabase
      .from("projects")
      .delete()
      .in(
        "id",
        found.data.map((row) => row.id),
      )
      .select("id");
    if (removed.error || removed.data.length !== found.data.length) {
      throw new Error(`owner ${index + 1} project cleanup was incomplete`);
    }
  }
  if (ids.length > 0) {
    for (const table of ["transactions", "import_profiles", "project_preferences", "import_runs"]) {
      const remaining = await supabase
        .from(table)
        .select("project_id", { count: "exact", head: true })
        .in("project_id", ids);
      if (remaining.error || remaining.count !== 0) {
        throw new Error(`owner ${index + 1} left technical rows in ${table}`);
      }
    }
  }
  const remainingProjects = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .like("name", `${prefixes[index]}-%`);
  if (remainingProjects.error || remainingProjects.count !== 0) {
    throw new Error(`owner ${index + 1} left technical projects`);
  }
}

let testFailure;
try {
  const anonymousProject = await anonymous.from("projects").select("id").limit(1);
  assert.ok(anonymousProject.error, "anonymous table access is rejected");
  const anonymousWorkspace = await anonymous.rpc("load_financial_workspace");
  assert.ok(anonymousWorkspace.error, "anonymous workspace access is rejected");
  const invalidWorkspace = await invalidSession.rpc("load_financial_workspace");
  assert.ok(invalidWorkspace.error, "invalid session is rejected");

  await signIn();
  const emptyA = await workspace(clients[0]);
  const emptyB = await workspace(clients[1]);
  assert.deepEqual(emptyA.projects, [], "disposable user A starts with an empty workspace");
  assert.deepEqual(emptyB.projects, [], "disposable user B starts with an empty workspace");
  console.log("PASS auth and empty workspaces");

  const projectA = await createProject(0, "project-main");
  const projectAWithoutProfile = await createProject(0, "project-no-profile");
  const projectB = await createProject(1, "project-main");
  const projectBDelete = await createProject(1, "project-delete");

  const updatedA = await clients[0]
    .from("projects")
    .update({ name: `${prefixes[0]}-project-main-renamed`, version: 2 })
    .eq("id", projectA.id)
    .eq("version", 1)
    .select("id,version")
    .single();
  assert.ifError(updatedA.error);
  projectA.version = updatedA.data.version;
  const deletedB = await clients[1]
    .from("projects")
    .delete()
    .eq("id", projectBDelete.id)
    .select("id");
  assert.ifError(deletedB.error);
  assert.equal(deletedB.data.length, 1, "B deletes its own disposable project");

  await assertCrossProjectIsolation(clients[1], projectA, "B against A");
  await assertCrossProjectIsolation(clients[0], projectB, "A against B");
  const forgedA = await clients[0]
    .from("projects")
    .insert({ owner_user_id: users[1].id, name: `${prefixes[0]}-forged` });
  const forgedB = await clients[1]
    .from("projects")
    .insert({ owner_user_id: users[0].id, name: `${prefixes[1]}-forged` });
  assert.ok(forgedA.error && forgedB.error, "owner forgery is rejected in both directions");
  console.log("PASS Projects A↔B");

  const transactionInput = {
    date: "2026-08-01",
    description: "Transação fictícia",
    category: "Teste remoto",
    type: "receita",
    amount: 1234.56,
    origin: "manual",
    additional_data: {
      text: "valor",
      number: 42.5,
      boolean: true,
      calendarDate: "2026-08-01",
    },
  };
  const transactionA = await createTransaction(clients[0], projectA.id, transactionInput);
  const duplicateA = await createTransaction(clients[0], projectA.id, transactionInput);
  assert.notEqual(transactionA.id, duplicateA.id, "identical legitimate rows remain distinct");
  const transactionB = await createTransaction(clients[1], projectB.id, {
    ...transactionInput,
    description: "Transação B",
    type: "despesa",
  });
  const deleteCandidateB = await createTransaction(clients[1], projectB.id, {
    ...transactionInput,
    description: "Excluir B",
  });
  assert.equal(transactionA.date, "2026-08-01", "date remains a date-only string");
  assert.equal(Number(transactionA.amount), 1234.56, "numeric(18,2) preserves monetary value");
  assert.deepEqual(transactionA.additional_data, transactionInput.additional_data);

  const updatedTransactionA = await clients[0]
    .rpc("update_financial_transaction", {
      p_project_id: projectA.id,
      p_transaction_id: transactionA.id,
      p_expected_version: transactionA.version,
      p_input: { amount: 1234.57, description: "Transação atualizada" },
    })
    .single();
  assert.ifError(updatedTransactionA.error);
  assert.equal(updatedTransactionA.data.version, transactionA.version + 1);
  const staleTransaction = await clients[0].rpc("update_financial_transaction", {
    p_project_id: projectA.id,
    p_transaction_id: transactionA.id,
    p_expected_version: transactionA.version,
    p_input: { amount: 999 },
  });
  assert.ok(staleTransaction.error?.message.includes("transaction_conflict"));
  const deletedTransactionB = await clients[1].rpc("delete_financial_transaction", {
    p_project_id: projectB.id,
    p_transaction_id: deleteCandidateB.id,
    p_expected_version: deleteCandidateB.version,
  });
  assert.ifError(deletedTransactionB.error);
  assert.equal(deletedTransactionB.data, true);

  await assertCrossTransactionIsolation(clients[1], updatedTransactionA.data, "B against A");
  await assertCrossTransactionIsolation(clients[0], transactionB, "A against B");
  const crossCreate = await clients[1].rpc("create_financial_transaction", {
    p_project_id: projectA.id,
    p_input: transactionInput,
  });
  assert.ok(crossCreate.error?.message.includes("project_not_found"));
  const reverseCrossCreate = await clients[0].rpc("create_financial_transaction", {
    p_project_id: projectB.id,
    p_input: transactionInput,
  });
  assert.ok(reverseCrossCreate.error?.message.includes("project_not_found"));
  const forgedTransactionByA = await clients[0].from("transactions").insert({
    project_id: projectB.id,
    owner_user_id: users[1].id,
    ...transactionInput,
  });
  const forgedTransactionByB = await clients[1].from("transactions").insert({
    project_id: projectA.id,
    owner_user_id: users[0].id,
    ...transactionInput,
  });
  assert.ok(
    forgedTransactionByA.error && forgedTransactionByB.error,
    "transaction ownership cannot be forged in either direction",
  );
  console.log("PASS Transactions CRUD, versions, values and A↔B");

  const importKey = randomUUID();
  const initialRows = [importedRow(), importedRow()];
  const initialRequest = {
    project: { name: `${prefixes[0]}-imported` },
    file: {
      originalFilename: `${prefixes[0]}-initial.csv`,
      fileHash: fileHash(`${prefixes[0]}-initial`),
    },
    profile: profile(),
    rows: initialRows,
    confirmPossibleDuplicates: true,
  };
  const initialImport = await clients[0].rpc("apply_initial_financial_import", {
    p_idempotency_key: importKey,
    p_request: initialRequest,
  });
  assert.ifError(initialImport.error);
  assert.equal(initialImport.data.replayed, false);
  assert.equal(initialImport.data.rowCount, 2);
  assert.equal(initialImport.data.duplicateCount, 2);
  const importedProjectId = initialImport.data.projectId;
  knownProjectIds[0].add(importedProjectId);

  const replay = await clients[0].rpc("apply_initial_financial_import", {
    p_idempotency_key: importKey,
    p_request: initialRequest,
  });
  assert.ifError(replay.error);
  assert.equal(replay.data.replayed, true, "same key and command replays the prior result");
  assert.equal(replay.data.importRunId, initialImport.data.importRunId);
  const idempotencyConflict = await clients[0].rpc("apply_initial_financial_import", {
    p_idempotency_key: importKey,
    p_request: {
      ...initialRequest,
      file: { ...initialRequest.file, fileHash: fileHash("different-command") },
    },
  });
  assert.ok(idempotencyConflict.error?.message.includes("idempotency_conflict"));

  const importedBeforeEdit = await clients[0]
    .from("transactions")
    .select("*")
    .eq("project_id", importedProjectId)
    .eq("origin", "imported")
    .order("id");
  assert.ifError(importedBeforeEdit.error);
  assert.equal(importedBeforeEdit.data.length, 2);
  assert.notEqual(importedBeforeEdit.data[0].id, importedBeforeEdit.data[1].id);

  const manualIdentical = await createTransaction(clients[0], importedProjectId, {
    ...importedRow(),
    origin: "manual",
  });
  assert.equal(manualIdentical.origin, "manual");
  const editedImported = await clients[0]
    .rpc("update_financial_transaction", {
      p_project_id: importedProjectId,
      p_transaction_id: importedBeforeEdit.data[0].id,
      p_expected_version: importedBeforeEdit.data[0].version,
      p_input: { description: "Importado editado manualmente" },
    })
    .single();
  assert.ifError(editedImported.error);
  assert.equal(editedImported.data.manually_modified, true);

  const currentImported = await clients[0]
    .from("transactions")
    .select("id,version")
    .eq("project_id", importedProjectId)
    .eq("origin", "imported")
    .order("id");
  assert.ifError(currentImported.error);
  const edited = currentImported.data.find((row) => row.id === editedImported.data.id);
  const removed = currentImported.data.find((row) => row.id !== editedImported.data.id);
  assert.ok(edited && removed);
  const finalUpdatedRow = importedRow({
    description: "Importado confirmado",
    amount: 200.25,
  });
  const finalInsertedRow = importedRow({
    date: "2026-08-06",
    description: "Novo importado",
    amount: 300.75,
  });
  const updatePlan = {
    expectedImported: currentImported.data,
    updates: [{ id: edited.id, expectedVersion: edited.version, row: finalUpdatedRow }],
    deletes: [{ id: removed.id, expectedVersion: removed.version }],
    inserts: [finalInsertedRow],
  };
  const projectBeforeUpdate = await clients[0]
    .from("projects")
    .select("version")
    .eq("id", importedProjectId)
    .single();
  assert.ifError(projectBeforeUpdate.error);
  const updateKey = randomUUID();
  const updateRequestBase = {
    projectId: importedProjectId,
    baseProjectVersion: projectBeforeUpdate.data.version,
    file: {
      originalFilename: `${prefixes[0]}-update.csv`,
      fileHash: fileHash(`${prefixes[0]}-update`),
    },
    profile: profile(),
    rows: [finalUpdatedRow, finalInsertedRow],
    confirmPossibleDuplicates: true,
  };
  const beforeRejectedUpdate = await projectState(clients[0], importedProjectId);
  const confirmationRequired = await clients[0].rpc("apply_financial_import_update", {
    p_project_id: importedProjectId,
    p_base_project_version: projectBeforeUpdate.data.version,
    p_idempotency_key: updateKey,
    p_request: { ...updateRequestBase, confirmManualOverwrite: false },
    p_plan: updatePlan,
  });
  assert.ok(confirmationRequired.error?.message.includes("manual_confirmation_required"));
  const afterRejectedUpdate = await projectState(clients[0], importedProjectId);
  assert.deepEqual(
    afterRejectedUpdate,
    beforeRejectedUpdate,
    "failed update leaves no partial write",
  );

  const confirmedRequest = { ...updateRequestBase, confirmManualOverwrite: true };
  const confirmedUpdate = await clients[0].rpc("apply_financial_import_update", {
    p_project_id: importedProjectId,
    p_base_project_version: projectBeforeUpdate.data.version,
    p_idempotency_key: updateKey,
    p_request: confirmedRequest,
    p_plan: updatePlan,
  });
  assert.ifError(confirmedUpdate.error);
  assert.equal(confirmedUpdate.data.projectVersion, projectBeforeUpdate.data.version + 1);
  assert.equal(confirmedUpdate.data.manualOverwriteCount, 1);
  assert.equal(confirmedUpdate.data.preservedManualCount, 1);
  const replayUpdate = await clients[0].rpc("apply_financial_import_update", {
    p_project_id: importedProjectId,
    p_base_project_version: projectBeforeUpdate.data.version,
    p_idempotency_key: updateKey,
    p_request: confirmedRequest,
    p_plan: updatePlan,
  });
  assert.ifError(replayUpdate.error);
  assert.equal(replayUpdate.data.replayed, true);
  assert.equal(replayUpdate.data.importRunId, confirmedUpdate.data.importRunId);
  const changedRetry = await clients[0].rpc("apply_financial_import_update", {
    p_project_id: importedProjectId,
    p_base_project_version: projectBeforeUpdate.data.version,
    p_idempotency_key: updateKey,
    p_request: {
      ...confirmedRequest,
      file: { ...confirmedRequest.file, fileHash: fileHash("changed") },
    },
    p_plan: updatePlan,
  });
  assert.ok(changedRetry.error?.message.includes("idempotency_conflict"));
  const staleUpdate = await clients[0].rpc("apply_financial_import_update", {
    p_project_id: importedProjectId,
    p_base_project_version: projectBeforeUpdate.data.version,
    p_idempotency_key: randomUUID(),
    p_request: confirmedRequest,
    p_plan: updatePlan,
  });
  assert.ok(staleUpdate.error?.message.includes("project_conflict"));

  const finalTransactions = await clients[0]
    .from("transactions")
    .select("id,origin,manually_modified,description,amount")
    .eq("project_id", importedProjectId);
  assert.ifError(finalTransactions.error);
  assert.equal(finalTransactions.data.length, 3);
  assert.equal(finalTransactions.data.filter((row) => row.origin === "manual").length, 1);
  assert.equal(finalTransactions.data.filter((row) => row.origin === "imported").length, 2);
  assert.ok(finalTransactions.data.some((row) => row.id === manualIdentical.id));

  const crossImport = await clients[1].rpc("apply_financial_import_update", {
    p_project_id: importedProjectId,
    p_base_project_version: confirmedUpdate.data.projectVersion,
    p_idempotency_key: randomUUID(),
    p_request: confirmedRequest,
    p_plan: updatePlan,
  });
  assert.ok(crossImport.error?.message.includes("project_not_found"));
  const reverseCrossImport = await clients[0].rpc("apply_financial_import_update", {
    p_project_id: projectB.id,
    p_base_project_version: 1,
    p_idempotency_key: randomUUID(),
    p_request: confirmedRequest,
    p_plan: updatePlan,
  });
  assert.ok(reverseCrossImport.error?.message.includes("project_not_found"));

  const atomicName = `${prefixes[0]}-atomic-invalid`;
  const atomicFailure = await clients[0].rpc("apply_initial_financial_import", {
    p_idempotency_key: randomUUID(),
    p_request: {
      project: { name: atomicName },
      file: { originalFilename: `${prefixes[0]}-invalid.csv`, fileHash: fileHash("invalid") },
      profile: profile(),
      rows: [importedRow({ amount: 0 })],
      confirmPossibleDuplicates: true,
    },
  });
  assert.ok(atomicFailure.error?.message.includes("invalid_import"));
  const partialProject = await clients[0]
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("name", atomicName);
  assert.ifError(partialProject.error);
  assert.equal(partialProject.count, 0, "invalid initial import rolls back its project");
  console.log("PASS imports, idempotency, conflicts and safe rollback");

  const firstPreference = await clients[0]
    .rpc("update_project_preferences", {
      p_project_id: importedProjectId,
      p_expected_version: null,
      p_visible_columns: [],
      p_analytical_dimensions: ["branch"],
    })
    .single();
  assert.ifError(firstPreference.error);
  assert.equal(firstPreference.data.version, 1);
  assert.deepEqual(firstPreference.data.visible_columns, []);
  assert.deepEqual(firstPreference.data.analytical_dimensions, ["branch"]);
  const secondPreference = await clients[0]
    .rpc("update_project_preferences", {
      p_project_id: importedProjectId,
      p_expected_version: 1,
      p_visible_columns: ["date", "branch"],
      p_analytical_dimensions: [],
    })
    .single();
  assert.ifError(secondPreference.error);
  assert.equal(secondPreference.data.version, 2);
  assert.deepEqual(secondPreference.data.analytical_dimensions, []);
  const stalePreference = await clients[0].rpc("update_project_preferences", {
    p_project_id: importedProjectId,
    p_expected_version: 1,
    p_visible_columns: [],
    p_analytical_dimensions: [],
  });
  assert.ok(stalePreference.error?.message.includes("preferences_conflict"));
  const crossPreferenceRead = await clients[1]
    .from("project_preferences")
    .select("project_id")
    .eq("project_id", importedProjectId);
  assert.ifError(crossPreferenceRead.error);
  assert.equal(crossPreferenceRead.data.length, 0);
  const crossPreferenceUpdate = await clients[1].rpc("update_project_preferences", {
    p_project_id: importedProjectId,
    p_expected_version: 2,
    p_visible_columns: [],
    p_analytical_dimensions: [],
  });
  assert.ok(crossPreferenceUpdate.error?.message.includes("project_not_found"));
  const preferenceB = await clients[1]
    .rpc("update_project_preferences", {
      p_project_id: projectB.id,
      p_expected_version: null,
      p_visible_columns: ["date"],
      p_analytical_dimensions: [],
    })
    .single();
  assert.ifError(preferenceB.error);
  const reversePreferenceRead = await clients[0]
    .from("project_preferences")
    .select("project_id")
    .eq("project_id", projectB.id);
  assert.ifError(reversePreferenceRead.error);
  assert.equal(reversePreferenceRead.data.length, 0);
  const reversePreferenceUpdate = await clients[0].rpc("update_project_preferences", {
    p_project_id: projectB.id,
    p_expected_version: preferenceB.data.version,
    p_visible_columns: [],
    p_analytical_dimensions: [],
  });
  assert.ok(reversePreferenceUpdate.error?.message.includes("project_not_found"));
  console.log("PASS Preferences versions and A↔B");

  const workspaceA = await workspace(clients[0]);
  const workspaceB = await workspace(clients[1]);
  const projectIdsA = new Set(workspaceA.projects.map((row) => row.id));
  const projectIdsB = new Set(workspaceB.projects.map((row) => row.id));
  assert.ok(projectIdsA.has(projectA.id) && projectIdsA.has(projectAWithoutProfile.id));
  assert.ok(projectIdsA.has(importedProjectId));
  assert.ok(projectIdsB.has(projectB.id));
  assert.ok(!projectIdsA.has(projectB.id) && !projectIdsB.has(projectA.id));
  assert.ok(workspaceA.transactions.some((row) => row.id === updatedTransactionA.data.id));
  assert.ok(workspaceB.transactions.some((row) => row.id === transactionB.id));
  assert.ok(!workspaceA.transactions.some((row) => row.id === transactionB.id));
  assert.ok(!workspaceB.transactions.some((row) => row.id === updatedTransactionA.data.id));
  assert.ok(workspaceA.import_profiles.some((row) => row.project_id === importedProjectId));
  assert.ok(
    !workspaceA.import_profiles.some((row) => row.project_id === projectAWithoutProfile.id),
  );
  const workspacePreference = workspaceA.project_preferences.find(
    (row) => row.project_id === importedProjectId,
  );
  assert.equal(workspacePreference.version, 2);
  assert.ok(workspaceA.projects.every((row) => Number.isInteger(row.version) && row.version >= 1));
  assert.ok(
    workspaceA.transactions.every((row) => Number.isInteger(row.version) && row.version >= 1),
  );
  console.log("PASS coherent Workspace snapshots A↔B");

  const importStoreSource = await readFile("src/lib/imports/supabase-import-store.ts", "utf8");
  assert.match(importStoreSource, /rpc\("apply_initial_financial_import"/);
  assert.match(importStoreSource, /rpc\("apply_financial_import_update"/);
  assert.doesNotMatch(importStoreSource, /for\s*\([^)]*\)\s*\{[^}]*create_financial_transaction/s);
  console.log("PASS import path uses atomic RPCs, not unit CRUD loops");
} catch (error) {
  testFailure = error;
} finally {
  const cleanupResults = await Promise.allSettled([cleanupOwner(0), cleanupOwner(1)]);
  const signOutResults = await Promise.allSettled(
    [anonymous, invalidSession, ...clients].map((supabase) => supabase.auth.signOut()),
  );
  const cleanupErrors = [];
  for (const [index, result] of cleanupResults.entries()) {
    if (result.status === "rejected") {
      cleanupErrors.push(new Error(`owner ${index + 1} cleanup failed`, { cause: result.reason }));
    }
  }
  for (const result of signOutResults) {
    if (result.status === "rejected" || result.value.error) {
      cleanupErrors.push(new Error("a disposable session sign-out failed"));
    }
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      testFailure ? [testFailure, ...cleanupErrors] : cleanupErrors,
      "Staging financial validation or cleanup failed.",
    );
  }
}

if (testFailure) throw testFailure;
console.log("Remote staging financial matrix passed and removed all technical fixtures.");
