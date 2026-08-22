import type { ImportProfile, Project, ProjectInput, Transaction } from "./finance-types";

export const DEFAULT_VISIBLE_COLUMNS = ["date", "description", "category", "type", "amount"];

export type FinancialWorkspace = {
  projects: Project[];
  activeProjectId: string | null;
  transactionsByProject: Record<string, Transaction[]>;
  importProfilesByProject: Record<string, ImportProfile>;
  visibleColumnsByProject: Record<string, string[]>;
  analyticDimensionsByProject: Record<string, string[]>;
};

export type ProjectPreferencesPatch = {
  visibleColumns?: string[];
  analyticDimensions?: string[];
};

export type ImportDestination =
  | { mode: "replace-project"; targetProjectId: string }
  | { mode: "create-project"; newProjectName: string };

export type WorkspaceMutation<T = void> = {
  workspace: FinancialWorkspace;
  result: T;
};

export interface FinancialRepository {
  loadWorkspace(): Promise<FinancialWorkspace>;
  selectProject(projectId: string): Promise<FinancialWorkspace>;
  createProject(input: ProjectInput): Promise<WorkspaceMutation<Project>>;
  updateProject(projectId: string, input: ProjectInput): Promise<FinancialWorkspace>;
  deleteProject(projectId: string): Promise<FinancialWorkspace>;
  createTransaction(projectId: string, transaction: Transaction): Promise<FinancialWorkspace>;
  updateTransaction(
    projectId: string,
    transactionId: string,
    patch: Partial<Transaction>,
  ): Promise<FinancialWorkspace>;
  deleteTransaction(projectId: string, transactionId: string): Promise<FinancialWorkspace>;
  importTransactions(
    transactions: Transaction[],
    profile: ImportProfile,
    destination: ImportDestination,
  ): Promise<WorkspaceMutation<Project>>;
  updateProjectPreferences(
    projectId: string,
    patch: ProjectPreferencesPatch,
  ): Promise<FinancialWorkspace>;
}

export function emptyFinancialWorkspace(): FinancialWorkspace {
  return {
    projects: [],
    activeProjectId: null,
    transactionsByProject: {},
    importProfilesByProject: {},
    visibleColumnsByProject: {},
    analyticDimensionsByProject: {},
  };
}
