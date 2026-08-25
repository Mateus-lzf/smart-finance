import type { ImportProfile } from "../finance-types";
import type { VersionedProject } from "../projects/project-repository";
import type { VersionedProjectPreferences } from "../preferences/project-preferences-repository";
import type { VersionedTransaction } from "../transactions/transaction-repository";

export type RemoteFinancialWorkspaceSnapshot = {
  projects: VersionedProject[];
  transactionsByProject: Record<string, VersionedTransaction[]>;
  importProfilesByProject: Record<string, ImportProfile>;
  preferencesByProject: Record<string, VersionedProjectPreferences>;
};

export type WorkspaceFunctionResult =
  | { ok: true; data: RemoteFinancialWorkspaceSnapshot }
  | { ok: false; code: "invalid_snapshot" | "unsupported_profile" | "unavailable" };

export interface RemoteWorkspaceRepository {
  loadWorkspaceSnapshot(): Promise<RemoteFinancialWorkspaceSnapshot>;
}

export class RemoteWorkspaceError extends Error {
  constructor(
    readonly code: "WORKSPACE_INVALID" | "WORKSPACE_PROFILE_UNSUPPORTED" | "WORKSPACE_UNAVAILABLE",
    message: string,
  ) {
    super(message);
  }
}
