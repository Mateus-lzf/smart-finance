import type { FinancialWorkspace } from "./financial-repository";
import type { Transaction } from "./finance-types";

export const LOCAL_STATE_KEY = "smart-finance.local-state.v2";
export const LEGACY_LOCAL_STATE_KEYS = ["clareza.local-state.v2"] as const;
const USER_LOCAL_STATE_KEY_PREFIX = `${LOCAL_STATE_KEY}.user`;

export type LocalState = FinancialWorkspace;

export function parseLocalState(raw: string): LocalState {
  const parsed = JSON.parse(raw) as Partial<LocalState>;
  const transactionsByProject = Object.fromEntries(
    Object.entries(parsed.transactionsByProject ?? {}).map(([projectId, rows]) => [
      projectId,
      Array.isArray(rows)
        ? rows.map((row) =>
            !row.origin && /^TX-\d{4}$/.test(row.id) ? { ...row, origin: "manual" as const } : row,
          )
        : [],
    ]),
  );
  return {
    projects: Array.isArray(parsed.projects) ? parsed.projects : [],
    activeProjectId: parsed.activeProjectId ?? null,
    transactionsByProject,
    importProfilesByProject: parsed.importProfilesByProject ?? {},
    visibleColumnsByProject: parsed.visibleColumnsByProject ?? {},
    analyticDimensionsByProject: parsed.analyticDimensionsByProject ?? {},
  };
}

export function serializeLocalState(state: LocalState) {
  return JSON.stringify(state);
}

export function getUserLocalStateKey(userId: string) {
  const normalized = userId.trim();
  if (!normalized) throw new Error("A identidade do usuário é obrigatória.");
  return `${USER_LOCAL_STATE_KEY_PREFIX}.${encodeURIComponent(normalized)}`;
}

export function loadUserLocalState(
  storage: Pick<Storage, "getItem">,
  userId: string,
): LocalState | null {
  const raw = storage.getItem(getUserLocalStateKey(userId));
  return raw ? parseLocalState(raw) : null;
}

export function persistLocalState(
  storage: Pick<Storage, "setItem">,
  state: LocalState,
  storageKey = LOCAL_STATE_KEY,
) {
  storage.setItem(storageKey, serializeLocalState(state));
}

export function replaceProjectTransactionsInLocalState(
  state: LocalState,
  projectId: string,
  rows: Transaction[],
  now = new Date().toISOString(),
): LocalState {
  if (!state.projects.some((project) => project.id === projectId))
    throw new Error("O projeto selecionado não está mais disponível.");
  return {
    ...state,
    projects: state.projects.map((project) =>
      project.id === projectId ? { ...project, updatedAt: now } : project,
    ),
    transactionsByProject: { ...state.transactionsByProject, [projectId]: rows },
  };
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
