import type { ImportProfile, Project, Transaction } from "./finance-types";

export const LOCAL_STATE_KEY = "clareza.local-state.v2";

export type LocalState = {
  projects: Project[];
  activeProjectId: string | null;
  transactionsByProject: Record<string, Transaction[]>;
  importProfilesByProject: Record<string, ImportProfile>;
};

export function parseLocalState(raw: string): LocalState {
  const parsed = JSON.parse(raw) as Partial<LocalState>;
  return {
    projects: Array.isArray(parsed.projects) ? parsed.projects : [],
    activeProjectId: parsed.activeProjectId ?? null,
    transactionsByProject: parsed.transactionsByProject ?? {},
    importProfilesByProject: parsed.importProfilesByProject ?? {},
  };
}

export function serializeLocalState(state: LocalState) {
  return JSON.stringify(state);
}
