import type { PreparedRemoteImportUpdate, RemoteImportResult } from "./import-repository";

export type ImportFunctionErrorCode =
  | "project_not_found"
  | "project_conflict"
  | "idempotency_conflict"
  | "duplicate_confirmation_required"
  | "manual_confirmation_required"
  | "invalid"
  | "limit_exceeded"
  | "unavailable";

export type ImportFunctionResult<T> =
  { ok: true; data: T } | { ok: false; code: ImportFunctionErrorCode };

export type PrepareImportResult = ImportFunctionResult<PreparedRemoteImportUpdate>;
export type ApplyImportResult = ImportFunctionResult<RemoteImportResult>;
