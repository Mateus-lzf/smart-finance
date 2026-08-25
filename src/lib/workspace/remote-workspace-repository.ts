import { loadRemoteFinancialWorkspace } from "./workspace-functions";
import {
  RemoteWorkspaceError,
  type RemoteWorkspaceRepository,
  type WorkspaceFunctionResult,
} from "./remote-workspace-types";

export type RemoteWorkspaceGateway = { load(): Promise<WorkspaceFunctionResult> };
const defaultGateway: RemoteWorkspaceGateway = { load: () => loadRemoteFinancialWorkspace() };

export class SupabaseRemoteWorkspaceRepository implements RemoteWorkspaceRepository {
  constructor(private readonly gateway: RemoteWorkspaceGateway = defaultGateway) {}

  async loadWorkspaceSnapshot() {
    const result = await this.gateway.load();
    if (result.ok) return result.data;
    if (result.code === "unsupported_profile") {
      throw new RemoteWorkspaceError(
        "WORKSPACE_PROFILE_UNSUPPORTED",
        "O perfil de importação remoto usa uma versão ainda não suportada.",
      );
    }
    if (result.code === "invalid_snapshot") {
      throw new RemoteWorkspaceError("WORKSPACE_INVALID", "O workspace remoto é inválido.");
    }
    throw new RemoteWorkspaceError(
      "WORKSPACE_UNAVAILABLE",
      "O workspace remoto está indisponível.",
    );
  }
}
