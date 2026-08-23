import type { VersionedProject } from "./project-repository";

export type ProjectFunctionErrorCode = "not_found" | "conflict" | "unavailable";

export type ProjectFunctionResult<T> =
  { ok: true; data: T } | { ok: false; code: ProjectFunctionErrorCode };

export type ListProjectsResult = ProjectFunctionResult<VersionedProject[]>;
export type GetProjectResult = ProjectFunctionResult<VersionedProject | null>;
export type MutateProjectResult = ProjectFunctionResult<VersionedProject>;
export type DeleteProjectResult = ProjectFunctionResult<null>;
