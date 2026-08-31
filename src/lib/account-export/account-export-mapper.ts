import { accountExportV1Schema, type AccountExportV1 } from "./account-export-schema";
import {
  accountExportRpcSnapshotSchema,
  accountExportUserSchema,
  type AccountExportUser,
} from "./account-export-rpc-schema";

function assertOwner(actual: string, expected: string) {
  if (actual !== expected) throw new Error("Invalid account export ownership");
}

export function mapAccountExportV1(userInput: unknown, snapshotInput: unknown): AccountExportV1 {
  const user: AccountExportUser = accountExportUserSchema.parse(userInput);
  const snapshot = accountExportRpcSnapshotSchema.parse(snapshotInput);
  const projectIds = new Set(snapshot.projects.map((project) => project.id));
  const importRunIds = new Set(snapshot.import_runs.map((run) => run.id));

  for (const project of snapshot.projects) assertOwner(project.owner_user_id, user.id);
  for (const transaction of snapshot.transactions) {
    assertOwner(transaction.owner_user_id, user.id);
    if (!projectIds.has(transaction.project_id))
      throw new Error("Invalid account export reference");
    if (transaction.import_run_id && !importRunIds.has(transaction.import_run_id)) {
      throw new Error("Invalid account export reference");
    }
  }
  for (const profile of snapshot.import_profiles) {
    assertOwner(profile.owner_user_id, user.id);
    if (!projectIds.has(profile.project_id)) throw new Error("Invalid account export reference");
  }
  for (const run of snapshot.import_runs) {
    assertOwner(run.owner_user_id, user.id);
    if (!projectIds.has(run.project_id)) throw new Error("Invalid account export reference");
  }
  for (const preference of snapshot.project_preferences) {
    assertOwner(preference.user_id, user.id);
    if (!projectIds.has(preference.project_id)) throw new Error("Invalid account export reference");
  }

  return accountExportV1Schema.parse({
    account: {
      id: user.id,
      email: user.email,
      emailConfirmedAt: user.email_confirmed_at,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      profile: snapshot.profile
        ? {
            displayName: snapshot.profile.display_name,
            locale: snapshot.profile.locale,
            createdAt: snapshot.profile.created_at,
            updatedAt: snapshot.profile.updated_at,
          }
        : null,
    },
    projects: snapshot.projects.map((project) => ({
      id: project.id,
      ownerUserId: project.owner_user_id,
      name: project.name,
      type: project.type,
      description: project.description,
      version: project.version,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
    })),
    transactions: snapshot.transactions.map((transaction) => ({
      id: transaction.id,
      projectId: transaction.project_id,
      ownerUserId: transaction.owner_user_id,
      date: transaction.date,
      description: transaction.description,
      category: transaction.category,
      type: transaction.type,
      amount: transaction.amount,
      origin: transaction.origin,
      manuallyModified: transaction.manually_modified,
      additionalData: transaction.additional_data,
      importRunId: transaction.import_run_id,
      version: transaction.version,
      createdAt: transaction.created_at,
      updatedAt: transaction.updated_at,
    })),
    importProfiles: snapshot.import_profiles.map((profile) => ({
      projectId: profile.project_id,
      ownerUserId: profile.owner_user_id,
      headers: profile.headers,
      columns: profile.columns,
      mapping: profile.mapping,
      schemaVersion: profile.schema_version,
      createdAt: profile.created_at,
      updatedAt: profile.updated_at,
    })),
    importRuns: snapshot.import_runs.map((run) => ({
      id: run.id,
      projectId: run.project_id,
      ownerUserId: run.owner_user_id,
      operation: run.operation,
      status: run.status,
      originalFilename: run.original_filename,
      fileHash: run.file_hash,
      rowCount: run.row_count,
      addedCount: run.added_count,
      changedCount: run.changed_count,
      removedCount: run.removed_count,
      duplicateCount: run.duplicate_count,
      unchangedCount: run.unchanged_count,
      preservedManualCount: run.preserved_manual_count,
      manualOverwriteCount: run.manual_overwrite_count,
      baseProjectVersion: run.base_project_version,
      resultProjectVersion: run.result_project_version,
      errorCode: run.error_code,
      createdAt: run.created_at,
      completedAt: run.completed_at,
    })),
    projectPreferences: snapshot.project_preferences.map((preference) => ({
      projectId: preference.project_id,
      userId: preference.user_id,
      visibleColumns: preference.visible_columns,
      analyticalDimensions: preference.analytical_dimensions,
      version: preference.version,
      createdAt: preference.created_at,
      updatedAt: preference.updated_at,
    })),
  });
}
