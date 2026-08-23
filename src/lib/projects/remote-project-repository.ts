import type { ProjectInput } from "../finance-types";
import type {
  DeleteProjectResult,
  GetProjectResult,
  ListProjectsResult,
  MutateProjectResult,
} from "./project-function-types";
import {
  createRemoteProject,
  deleteRemoteProject,
  getRemoteProject,
  listRemoteProjects,
  updateRemoteProject,
} from "./project-functions";
import {
  ProjectRepositoryError,
  type ProjectRepository,
  type ProjectRepositoryErrorCode,
} from "./project-repository";

export type RemoteProjectGateway = {
  list(): Promise<ListProjectsResult>;
  get(data: { id: string }): Promise<GetProjectResult>;
  create(data: ProjectInput): Promise<MutateProjectResult>;
  update(data: {
    id: string;
    expectedVersion: number;
    input: ProjectInput;
  }): Promise<MutateProjectResult>;
  delete(data: { id: string; expectedVersion: number }): Promise<DeleteProjectResult>;
};

const defaultGateway: RemoteProjectGateway = {
  list: () => listRemoteProjects(),
  get: (data) => getRemoteProject({ data }),
  create: (data) => createRemoteProject({ data }),
  update: (data) => updateRemoteProject({ data }),
  delete: (data) => deleteRemoteProject({ data }),
};

const errorCodes: Record<"not_found" | "conflict" | "unavailable", ProjectRepositoryErrorCode> = {
  not_found: "PROJECT_NOT_FOUND",
  conflict: "PROJECT_CONFLICT",
  unavailable: "PROJECT_UNAVAILABLE",
};

function unwrap<T>(result: { ok: true; data: T } | { ok: false; code: keyof typeof errorCodes }) {
  if (result.ok) return result.data;
  const code = errorCodes[result.code];
  const message =
    code === "PROJECT_CONFLICT"
      ? "O projeto foi alterado em outra sessão. Recarregue os dados antes de tentar novamente."
      : code === "PROJECT_NOT_FOUND"
        ? "O projeto não está disponível."
        : "Não foi possível acessar os projetos agora.";
  throw new ProjectRepositoryError(code, message);
}

export class RemoteProjectRepository implements ProjectRepository {
  constructor(private readonly gateway: RemoteProjectGateway = defaultGateway) {}

  async listProjects() {
    return unwrap(await this.gateway.list());
  }

  async getProject(projectId: string) {
    return unwrap(await this.gateway.get({ id: projectId }));
  }

  async createProject(input: ProjectInput) {
    return unwrap(await this.gateway.create(input));
  }

  async updateProject(projectId: string, expectedVersion: number, input: ProjectInput) {
    return unwrap(await this.gateway.update({ id: projectId, expectedVersion, input }));
  }

  async deleteProject(projectId: string, expectedVersion: number) {
    unwrap(await this.gateway.delete({ id: projectId, expectedVersion }));
  }
}
