import type { ColumnMapping, ImportedColumn, ImportedValue, ProjectInput } from "../finance-types";

export const REMOTE_IMPORT_MAX_ROWS = 5_000;
export const REMOTE_IMPORT_MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;
export const REMOTE_IMPORT_MAX_COLUMNS = 256;
export const REMOTE_IMPORT_MAX_ADDITIONAL_FIELDS = 64;
export const REMOTE_IMPORT_MAX_ADDITIONAL_BYTES = 32 * 1024;

export type RemoteImportRow = {
  date: string;
  description: string;
  category: string;
  type: "receita" | "despesa";
  amount: number;
  additionalData?: Record<string, ImportedValue>;
};

export type RemoteImportProfile = {
  headers: string[];
  columns: ImportedColumn[];
  mapping: ColumnMapping;
};

export type RemoteImportFile = {
  originalFilename: string;
  fileHash: string;
};

export type InitialRemoteImportCommand = {
  idempotencyKey: string;
  project: ProjectInput;
  file: RemoteImportFile;
  profile: RemoteImportProfile;
  rows: RemoteImportRow[];
  confirmPossibleDuplicates: boolean;
};

export type UpdateRemoteImportCommand = {
  idempotencyKey: string;
  projectId: string;
  baseProjectVersion: number;
  file: RemoteImportFile;
  profile: RemoteImportProfile;
  rows: RemoteImportRow[];
  confirmPossibleDuplicates: boolean;
  confirmManualOverwrite: boolean;
};

export type RemoteImportSummary = {
  rowCount: number;
  addedCount: number;
  changedCount: number;
  removedCount: number;
  unchangedCount: number;
  duplicateCount: number;
  preservedManualCount: number;
  manualOverwriteCount: number;
};

export type PreparedRemoteImportUpdate = RemoteImportSummary & {
  projectId: string;
  baseProjectVersion: number;
};

export type RemoteImportResult = RemoteImportSummary & {
  projectId: string;
  projectVersion: number;
  importRunId: string;
  replayed: boolean;
};

export type ImportRepositoryErrorCode =
  | "PROJECT_NOT_FOUND"
  | "PROJECT_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "DUPLICATE_CONFIRMATION_REQUIRED"
  | "MANUAL_OVERWRITE_CONFIRMATION_REQUIRED"
  | "IMPORT_INVALID"
  | "IMPORT_LIMIT_EXCEEDED"
  | "IMPORT_UNAVAILABLE";

export class ImportRepositoryError extends Error {
  constructor(
    public readonly code: ImportRepositoryErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ImportRepositoryError";
  }
}

export interface ImportRepository {
  prepareImportUpdate(
    projectId: string,
    rows: RemoteImportRow[],
  ): Promise<PreparedRemoteImportUpdate>;
  applyInitialImport(command: InitialRemoteImportCommand): Promise<RemoteImportResult>;
  applyImportUpdate(command: UpdateRemoteImportCommand): Promise<RemoteImportResult>;
}
