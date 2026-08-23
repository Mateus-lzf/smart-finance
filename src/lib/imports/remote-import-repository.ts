import type { ApplyImportResult, PrepareImportResult } from "./import-function-types";
import {
  applyInitialRemoteImport,
  applyRemoteImportUpdate,
  prepareRemoteImportUpdate,
} from "./import-functions";
import {
  ImportRepositoryError,
  type ImportRepository,
  type ImportRepositoryErrorCode,
  type InitialRemoteImportCommand,
  type RemoteImportRow,
  type UpdateRemoteImportCommand,
} from "./import-repository";

export type RemoteImportGateway = {
  prepare(data: { projectId: string; rows: RemoteImportRow[] }): Promise<PrepareImportResult>;
  initial(data: InitialRemoteImportCommand): Promise<ApplyImportResult>;
  update(data: UpdateRemoteImportCommand): Promise<ApplyImportResult>;
};

const defaultGateway: RemoteImportGateway = {
  prepare: (data) => prepareRemoteImportUpdate({ data }),
  initial: (data) => applyInitialRemoteImport({ data }),
  update: (data) => applyRemoteImportUpdate({ data }),
};

const errorCodes = {
  project_not_found: "PROJECT_NOT_FOUND",
  project_conflict: "PROJECT_CONFLICT",
  idempotency_conflict: "IDEMPOTENCY_CONFLICT",
  duplicate_confirmation_required: "DUPLICATE_CONFIRMATION_REQUIRED",
  manual_confirmation_required: "MANUAL_OVERWRITE_CONFIRMATION_REQUIRED",
  invalid: "IMPORT_INVALID",
  limit_exceeded: "IMPORT_LIMIT_EXCEEDED",
  unavailable: "IMPORT_UNAVAILABLE",
} as const satisfies Record<string, ImportRepositoryErrorCode>;

function unwrap<T>(result: { ok: true; data: T } | { ok: false; code: keyof typeof errorCodes }) {
  if (result.ok) return result.data;
  const code = errorCodes[result.code];
  throw new ImportRepositoryError(code, "Não foi possível concluir a importação remota.");
}

export class RemoteImportRepository implements ImportRepository {
  constructor(private readonly gateway: RemoteImportGateway = defaultGateway) {}

  async prepareImportUpdate(projectId: string, rows: RemoteImportRow[]) {
    return unwrap(await this.gateway.prepare({ projectId, rows }));
  }

  async applyInitialImport(command: InitialRemoteImportCommand) {
    return unwrap(await this.gateway.initial(command));
  }

  async applyImportUpdate(command: UpdateRemoteImportCommand) {
    return unwrap(await this.gateway.update(command));
  }
}
