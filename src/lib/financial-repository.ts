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

export type FinancialImportCommand = {
  transactions: Transaction[];
  profile: ImportProfile;
  destination: ImportDestination;
  file: { originalFilename: string; fileHash: string };
  idempotencyKey: string;
  confirmPossibleDuplicates: boolean;
  confirmManualOverwrite: boolean;
};

export type FinancialRepositoryErrorCode =
  "UNAUTHORIZED" | "NOT_FOUND" | "CONFLICT" | "VALIDATION" | "LIMIT_EXCEEDED" | "UNAVAILABLE";

export class FinancialRepositoryError extends Error {
  constructor(
    public readonly code: FinancialRepositoryErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "FinancialRepositoryError";
  }
}

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
  importTransactions(command: FinancialImportCommand): Promise<WorkspaceMutation<Project>>;
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
