import type { ImportProfile, Project, Transaction } from "./finance-types";

export const LOCAL_STATE_KEY = "smart-finance.local-state.v2";
export const LEGACY_LOCAL_STATE_KEYS = ["clareza.local-state.v2"] as const;

export type LocalState = {
  projects: Project[];
  activeProjectId: string | null;
  transactionsByProject: Record<string, Transaction[]>;
  importProfilesByProject: Record<string, ImportProfile>;
  visibleColumnsByProject: Record<string, string[]>;
  analyticDimensionsByProject: Record<string, string[]>;
};

export function parseLocalState(raw: string): LocalState {
  const parsed = JSON.parse(raw) as Partial<LocalState>;
  return {
    projects: Array.isArray(parsed.projects) ? parsed.projects : [],
    activeProjectId: parsed.activeProjectId ?? null,
    transactionsByProject: parsed.transactionsByProject ?? {},
    importProfilesByProject: parsed.importProfilesByProject ?? {},
    visibleColumnsByProject: parsed.visibleColumnsByProject ?? {},
    analyticDimensionsByProject: parsed.analyticDimensionsByProject ?? {},
  };
}

export function serializeLocalState(state: LocalState) {
  return JSON.stringify(state);
}

export function persistLocalState(storage: Pick<Storage, "setItem">, state: LocalState) {
  storage.setItem(LOCAL_STATE_KEY, serializeLocalState(state));
}

export function deleteProjectFromLocalState(state: LocalState, projectId: string): LocalState {
  const projects = state.projects.filter((project) => project.id !== projectId);
  const { [projectId]: removedTransactions, ...transactionsByProject } =
    state.transactionsByProject;
  const { [projectId]: removedProfile, ...importProfilesByProject } = state.importProfilesByProject;
  const { [projectId]: removedColumns, ...visibleColumnsByProject } =
    state.visibleColumnsByProject ?? {};
  const { [projectId]: removedDimensions, ...analyticDimensionsByProject } =
    state.analyticDimensionsByProject ?? {};
  void removedTransactions;
  void removedProfile;
  void removedColumns;
  void removedDimensions;
  return {
    projects,
    activeProjectId:
      state.activeProjectId === projectId ? (projects[0]?.id ?? null) : state.activeProjectId,
    transactionsByProject,
    importProfilesByProject,
    visibleColumnsByProject,
    analyticDimensionsByProject,
  };
}
