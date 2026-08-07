import type { Project, ProjectInput, Transaction } from "./finance-types";

function newId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `project-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export function createLocalProject(
  input: ProjectInput,
  options: { id?: string; now?: string } = {},
): Project {
  const now = options.now ?? new Date().toISOString();
  return {
    id: options.id ?? newId(),
    name: input.name.trim(),
    ...(input.type?.trim() ? { type: input.type.trim() } : {}),
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

export function updateLocalProject(
  project: Project,
  input: ProjectInput,
  now = new Date().toISOString(),
) {
  const { type: _type, description: _description, ...base } = project;
  return {
    ...base,
    name: input.name.trim(),
    ...(input.type?.trim() ? { type: input.type.trim() } : {}),
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    updatedAt: now,
  } satisfies Project;
}

export function deleteLocalProject(
  projects: Project[],
  transactionsByProject: Record<string, Transaction[]>,
  activeProjectId: string | null,
  projectId: string,
) {
  const nextProjects = projects.filter((project) => project.id !== projectId);
  const { [projectId]: removed, ...nextTransactions } = transactionsByProject;
  void removed;
  return {
    projects: nextProjects,
    transactionsByProject: nextTransactions,
    activeProjectId:
      activeProjectId === projectId ? (nextProjects[0]?.id ?? null) : activeProjectId,
  };
}
