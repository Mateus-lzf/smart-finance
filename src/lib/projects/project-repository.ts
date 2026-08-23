import type { Project, ProjectInput } from "../finance-types";

export type VersionedProject = {
  project: Project;
  version: number;
};

export type ProjectRepositoryErrorCode =
  "PROJECT_NOT_FOUND" | "PROJECT_CONFLICT" | "PROJECT_UNAVAILABLE";

export class ProjectRepositoryError extends Error {
  constructor(
    public readonly code: ProjectRepositoryErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ProjectRepositoryError";
  }
}

export interface ProjectRepository {
  listProjects(): Promise<VersionedProject[]>;
  getProject(projectId: string): Promise<VersionedProject | null>;
  createProject(input: ProjectInput): Promise<VersionedProject>;
  updateProject(
    projectId: string,
    expectedVersion: number,
    input: ProjectInput,
  ): Promise<VersionedProject>;
  deleteProject(projectId: string, expectedVersion: number): Promise<void>;
}
