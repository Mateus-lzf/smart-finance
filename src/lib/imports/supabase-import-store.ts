import { createServerOnlyFn } from "@tanstack/react-start";
import type { Json } from "../supabase/database.types";
import { createSupabaseServerClient } from "../supabase/server-client";
import { compareTransactionUpdates } from "../transaction-update-service";
import { mapTransactionRow } from "../transactions/transaction-mapper";
import type { VersionedTransaction } from "../transactions/transaction-repository";
import type {
  ApplyImportResult,
  ImportFunctionErrorCode,
  PrepareImportResult,
} from "./import-function-types";
import type {
  InitialRemoteImportCommand,
  RemoteImportResult,
  RemoteImportRow,
  UpdateRemoteImportCommand,
} from "./import-repository";

const TRANSACTION_COLUMNS =
  "id,project_id,owner_user_id,date,description,category,type,amount,origin,manually_modified,additional_data,import_run_id,version,created_at,updated_at";

function incomingTransactions(rows: RemoteImportRow[]) {
  return rows.map((row, index) => ({
    id: `incoming:${index}`,
    ...row,
    origin: "imported" as const,
  }));
}

function comparisonFor(current: VersionedTransaction[], rows: RemoteImportRow[]) {
  return compareTransactionUpdates(
    current.map(({ transaction }) => transaction),
    incomingTransactions(rows),
  );
}

function summaryFromComparison(
  rows: RemoteImportRow[],
  comparison: ReturnType<typeof comparisonFor>,
) {
  return {
    rowCount: rows.length,
    addedCount: comparison.added.length,
    changedCount: comparison.changed.length,
    removedCount: comparison.removed.length,
    unchangedCount: comparison.unchanged.length,
    duplicateCount: comparison.possibleDuplicates.length,
    preservedManualCount: comparison.preservedManual.length,
    manualOverwriteCount: comparison.manualEditsOverwritten.length,
  };
}

function toDatabaseRow(row: RemoteImportRow) {
  return {
    date: row.date,
    description: row.description.trim(),
    category: row.category.trim(),
    type: row.type,
    amount: row.amount,
    additional_data: (row.additionalData ?? {}) as Json,
  };
}

function rpcCode(error: { message?: string } | null): ImportFunctionErrorCode {
  const message = error?.message ?? "";
  if (message.includes("project_not_found")) return "project_not_found";
  if (message.includes("project_conflict")) return "project_conflict";
  if (message.includes("idempotency_conflict")) return "idempotency_conflict";
  if (message.includes("manual_confirmation_required")) return "manual_confirmation_required";
  if (message.includes("duplicate_confirmation_required")) return "duplicate_confirmation_required";
  if (message.includes("import_limit_exceeded")) return "limit_exceeded";
  if (message.includes("invalid_import")) return "invalid";
  return "unavailable";
}

function mapRpcResult(value: Json): RemoteImportResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Resposta inválida da importação remota.");
  }
  const row = value as Record<string, Json | undefined>;
  const number = (key: string) => {
    const current = row[key];
    if (typeof current !== "number") throw new Error("Resposta inválida da importação remota.");
    return current;
  };
  if (
    typeof row["projectId"] !== "string" ||
    typeof row["importRunId"] !== "string" ||
    typeof row["replayed"] !== "boolean"
  ) {
    throw new Error("Resposta inválida da importação remota.");
  }
  return {
    projectId: row["projectId"],
    importRunId: row["importRunId"],
    replayed: row["replayed"],
    projectVersion: number("projectVersion"),
    rowCount: number("rowCount"),
    addedCount: number("addedCount"),
    changedCount: number("changedCount"),
    removedCount: number("removedCount"),
    unchangedCount: number("unchangedCount"),
    duplicateCount: number("duplicateCount"),
    preservedManualCount: number("preservedManualCount"),
    manualOverwriteCount: number("manualOverwriteCount"),
  };
}

async function loadOwnedProjectAndTransactions(projectId: string, ownerUserId: string) {
  const supabase = createSupabaseServerClient();
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id,version")
    .eq("id", projectId)
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();
  if (projectError) return { ok: false as const, code: "unavailable" as const };
  if (!project) return { ok: false as const, code: "project_not_found" as const };
  const { data, error } = await supabase
    .from("transactions")
    .select(TRANSACTION_COLUMNS)
    .eq("project_id", projectId)
    .eq("owner_user_id", ownerUserId)
    .order("date", { ascending: true })
    .order("id", { ascending: true });
  if (error) return { ok: false as const, code: "unavailable" as const };
  try {
    return { ok: true as const, project, transactions: data.map(mapTransactionRow) };
  } catch {
    return { ok: false as const, code: "unavailable" as const };
  }
}

function buildUpdatePlan(current: VersionedTransaction[], rows: RemoteImportRow[]) {
  const comparison = comparisonFor(current, rows);
  const byId = new Map(current.map((item) => [item.transaction.id, item]));
  return {
    comparison,
    plan: {
      expectedImported: current
        .filter(({ transaction }) => transaction.origin === "imported")
        .map(({ transaction, version }) => ({ id: transaction.id, version })),
      inserts: comparison.added.map(toDatabaseRow),
      updates: comparison.changed.map(({ before, after }) => ({
        id: before.id,
        expectedVersion: byId.get(before.id)!.version,
        row: toDatabaseRow(after),
      })),
      deletes: comparison.removed.map((row) => ({
        id: row.id,
        expectedVersion: byId.get(row.id)!.version,
      })),
    },
  };
}

export const createSupabaseImportStore = createServerOnlyFn(() => ({
  async prepare(
    projectId: string,
    ownerUserId: string,
    rows: RemoteImportRow[],
  ): Promise<PrepareImportResult> {
    const loaded = await loadOwnedProjectAndTransactions(projectId, ownerUserId);
    if (!loaded.ok) return loaded;
    const comparison = comparisonFor(loaded.transactions, rows);
    return {
      ok: true,
      data: {
        projectId,
        baseProjectVersion: loaded.project.version,
        ...summaryFromComparison(rows, comparison),
      },
    };
  },

  async applyInitial(
    _ownerUserId: string,
    command: InitialRemoteImportCommand,
  ): Promise<ApplyImportResult> {
    const rows = incomingTransactions(command.rows);
    const comparison = compareTransactionUpdates([], rows);
    if (comparison.possibleDuplicates.length && !command.confirmPossibleDuplicates) {
      return { ok: false, code: "duplicate_confirmation_required" };
    }
    const request = {
      project: command.project,
      file: command.file,
      profile: command.profile,
      rows: command.rows.map(toDatabaseRow),
      confirmPossibleDuplicates: command.confirmPossibleDuplicates,
    };
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc("apply_initial_financial_import", {
      p_idempotency_key: command.idempotencyKey,
      p_request: request as unknown as Json,
    });
    if (error || !data) return { ok: false, code: rpcCode(error) };
    try {
      return { ok: true, data: mapRpcResult(data) };
    } catch {
      return { ok: false, code: "unavailable" };
    }
  },

  async applyUpdate(
    ownerUserId: string,
    command: UpdateRemoteImportCommand,
  ): Promise<ApplyImportResult> {
    const loaded = await loadOwnedProjectAndTransactions(command.projectId, ownerUserId);
    if (!loaded.ok) return loaded;
    const { comparison, plan } = buildUpdatePlan(loaded.transactions, command.rows);
    if (comparison.possibleDuplicates.length && !command.confirmPossibleDuplicates) {
      return { ok: false, code: "duplicate_confirmation_required" };
    }
    if (comparison.manualEditsOverwritten.length && !command.confirmManualOverwrite) {
      return { ok: false, code: "manual_confirmation_required" };
    }
    const request = {
      projectId: command.projectId,
      baseProjectVersion: command.baseProjectVersion,
      file: command.file,
      profile: command.profile,
      rows: command.rows.map(toDatabaseRow),
      confirmPossibleDuplicates: command.confirmPossibleDuplicates,
      confirmManualOverwrite: command.confirmManualOverwrite,
    };
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc("apply_financial_import_update", {
      p_base_project_version: command.baseProjectVersion,
      p_idempotency_key: command.idempotencyKey,
      p_plan: plan as unknown as Json,
      p_project_id: command.projectId,
      p_request: request as unknown as Json,
    });
    if (error || !data) return { ok: false, code: rpcCode(error) };
    try {
      return { ok: true, data: mapRpcResult(data) };
    } catch {
      return { ok: false, code: "unavailable" };
    }
  },
}));
