import type {
  FinancialImportCommand,
  FinancialRepository,
  FinancialRepositoryErrorCode,
  FinancialWorkspace,
  ProjectPreferencesPatch,
  WorkspaceMutation,
} from "./financial-repository";
import {
  DEFAULT_VISIBLE_COLUMNS,
  FinancialRepositoryError,
  emptyFinancialWorkspace,
} from "./financial-repository";
import type { Project, ProjectInput, Transaction } from "./finance-types";
import {
  ImportRepositoryError,
  type ImportRepository,
  type RemoteImportProfile,
  type RemoteImportRow,
} from "./imports/import-repository";
import { RemoteImportRepository } from "./imports/remote-import-repository";
import {
  ProjectPreferencesRepositoryError,
  type ProjectPreferencesRepository,
} from "./preferences/project-preferences-repository";
import { RemoteProjectPreferencesRepository } from "./preferences/remote-project-preferences-repository";
import { ProjectRepositoryError, type ProjectRepository } from "./projects/project-repository";
import { RemoteProjectRepository } from "./projects/remote-project-repository";
import {
  TransactionRepositoryError,
  type TransactionCreateInput,
  type TransactionRepository,
  type TransactionUpdateInput,
} from "./transactions/transaction-repository";
import { RemoteTransactionRepository } from "./transactions/remote-transaction-repository";
import { SupabaseRemoteWorkspaceRepository } from "./workspace/remote-workspace-repository";
import {
  RemoteWorkspaceError,
  type RemoteFinancialWorkspaceSnapshot,
  type RemoteWorkspaceRepository,
} from "./workspace/remote-workspace-types";

export type RemoteFinancialRepositoryDependencies = {
  workspace: RemoteWorkspaceRepository;
  projects: ProjectRepository;
  transactions: TransactionRepository;
  imports: ImportRepository;
  preferences: ProjectPreferencesRepository;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function financialWorkspace(
  snapshot: RemoteFinancialWorkspaceSnapshot,
  requestedActiveProjectId: string | null,
): FinancialWorkspace {
  const projectIds = new Set(snapshot.projects.map(({ project }) => project.id));
  const activeProjectId =
    requestedActiveProjectId && projectIds.has(requestedActiveProjectId)
      ? requestedActiveProjectId
      : (snapshot.projects[0]?.project.id ?? null);
  return {
    projects: snapshot.projects.map(({ project }) => clone(project)),
    activeProjectId,
    transactionsByProject: Object.fromEntries(
      snapshot.projects.map(({ project }) => [
        project.id,
        (snapshot.transactionsByProject[project.id] ?? []).map(({ transaction }) =>
          clone(transaction),
        ),
      ]),
    ),
    importProfilesByProject: clone(snapshot.importProfilesByProject),
    visibleColumnsByProject: Object.fromEntries(
      snapshot.projects.map(({ project }) => [
        project.id,
        [
          ...(snapshot.preferencesByProject[project.id]?.preferences.visibleColumns ??
            DEFAULT_VISIBLE_COLUMNS),
        ],
      ]),
    ),
    analyticDimensionsByProject: Object.fromEntries(
      snapshot.projects.map(({ project }) => [
        project.id,
        [...(snapshot.preferencesByProject[project.id]?.preferences.analyticDimensions ?? [])],
      ]),
    ),
  };
}

function projectVersion(snapshot: RemoteFinancialWorkspaceSnapshot, projectId: string) {
  const project = snapshot.projects.find((item) => item.project.id === projectId);
  if (!project) throw new FinancialRepositoryError("NOT_FOUND", "O projeto não está disponível.");
  return project.version;
}

function transactionVersion(
  snapshot: RemoteFinancialWorkspaceSnapshot,
  projectId: string,
  transactionId: string,
) {
  const transaction = snapshot.transactionsByProject[projectId]?.find(
    (item) => item.transaction.id === transactionId,
  );
  if (!transaction) {
    throw new FinancialRepositoryError("NOT_FOUND", "O lançamento não está disponível.");
  }
  return transaction.version;
}

function importProfile(command: FinancialImportCommand): RemoteImportProfile {
  if (!command.profile.columns) {
    throw new FinancialRepositoryError(
      "VALIDATION",
      "O perfil de importação não contém os metadados das colunas.",
    );
  }
  return {
    headers: command.profile.headers,
    columns: command.profile.columns,
    mapping: command.profile.mapping,
  };
}

function importRows(transactions: Transaction[]): RemoteImportRow[] {
  return transactions.map((transaction) => ({
    date: transaction.date,
    description: transaction.description,
    category: transaction.category,
    type: transaction.type,
    amount: transaction.amount,
    ...(transaction.additionalData ? { additionalData: transaction.additionalData } : {}),
  }));
}

function transactionCreateInput(transaction: Transaction): TransactionCreateInput {
  return {
    date: transaction.date,
    description: transaction.description,
    category: transaction.category,
    type: transaction.type,
    amount: transaction.amount,
    origin: transaction.origin ?? "manual",
    ...(transaction.additionalData ? { additionalData: transaction.additionalData } : {}),
  };
}

function transactionUpdateInput(patch: Partial<Transaction>): TransactionUpdateInput {
  return {
    ...(patch.date !== undefined ? { date: patch.date } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.category !== undefined ? { category: patch.category } : {}),
    ...(patch.type !== undefined ? { type: patch.type } : {}),
    ...(patch.amount !== undefined ? { amount: patch.amount } : {}),
    ...(patch.additionalData !== undefined ? { additionalData: patch.additionalData } : {}),
  };
}

function normalizedCode(error: unknown): FinancialRepositoryErrorCode {
  if (error instanceof FinancialRepositoryError) return error.code;
  if (error instanceof ProjectRepositoryError) {
    if (error.code === "PROJECT_CONFLICT") return "CONFLICT";
    if (error.code === "PROJECT_NOT_FOUND") return "NOT_FOUND";
    return "UNAVAILABLE";
  }
  if (error instanceof TransactionRepositoryError) {
    if (error.code === "TRANSACTION_CONFLICT") return "CONFLICT";
    if (error.code === "PROJECT_NOT_FOUND" || error.code === "TRANSACTION_NOT_FOUND")
      return "NOT_FOUND";
    return "UNAVAILABLE";
  }
  if (error instanceof ProjectPreferencesRepositoryError) {
    if (error.code === "PREFERENCES_CONFLICT") return "CONFLICT";
    if (error.code === "PREFERENCES_INVALID") return "VALIDATION";
    if (error.code === "PROJECT_NOT_FOUND") return "NOT_FOUND";
    return "UNAVAILABLE";
  }
  if (error instanceof ImportRepositoryError) {
    if (
      error.code === "PROJECT_CONFLICT" ||
      error.code === "IDEMPOTENCY_CONFLICT" ||
      error.code === "DUPLICATE_CONFIRMATION_REQUIRED" ||
      error.code === "MANUAL_OVERWRITE_CONFIRMATION_REQUIRED"
    )
      return "CONFLICT";
    if (error.code === "PROJECT_NOT_FOUND") return "NOT_FOUND";
    if (error.code === "IMPORT_INVALID") return "VALIDATION";
    if (error.code === "IMPORT_LIMIT_EXCEEDED") return "LIMIT_EXCEEDED";
    return "UNAVAILABLE";
  }
  if (error instanceof RemoteWorkspaceError) {
    return error.code === "WORKSPACE_UNAVAILABLE" ? "UNAVAILABLE" : "VALIDATION";
  }
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("unauthorized") || message.includes("session") || message.includes("auth")) {
    return "UNAUTHORIZED";
  }
  return "UNAVAILABLE";
}

function normalizeError(error: unknown) {
  if (error instanceof FinancialRepositoryError) return error;
  const code = normalizedCode(error);
  const messages: Record<FinancialRepositoryErrorCode, string> = {
    UNAUTHORIZED: "Sua sessão expirou. Entre novamente para continuar.",
    NOT_FOUND: "O dado solicitado não está disponível.",
    CONFLICT: "Os dados foram alterados em outra sessão. Recarregue antes de tentar novamente.",
    VALIDATION: "Os dados informados não são válidos.",
    LIMIT_EXCEEDED: "A operação excede o limite permitido.",
    UNAVAILABLE: "Não foi possível acessar os dados financeiros agora.",
  };
  return new FinancialRepositoryError(code, messages[code], { cause: error });
}

export class RemoteFinancialRepository implements FinancialRepository {
  private snapshot: RemoteFinancialWorkspaceSnapshot | null = null;
  private activeProjectId: string | null = null;
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly dependencies: RemoteFinancialRepositoryDependencies) {}

  async loadWorkspace() {
    await this.reload();
    return this.currentWorkspace();
  }

  async selectProject(projectId: string) {
    const snapshot = await this.ensureSnapshot();
    projectVersion(snapshot, projectId);
    this.activeProjectId = projectId;
    return this.currentWorkspace();
  }

  async createProject(input: ProjectInput): Promise<WorkspaceMutation<Project>> {
    return this.mutate(async () => {
      const created = await this.dependencies.projects.createProject(input);
      this.activeProjectId = created.project.id;
      await this.reload();
      return { workspace: this.currentWorkspace(), result: clone(created.project) };
    });
  }

  async updateProject(projectId: string, input: ProjectInput) {
    return this.mutate(async () => {
      const snapshot = await this.ensureSnapshot();
      await this.dependencies.projects.updateProject(
        projectId,
        projectVersion(snapshot, projectId),
        input,
      );
      await this.reload();
      return this.currentWorkspace();
    });
  }

  async deleteProject(projectId: string) {
    return this.mutate(async () => {
      const snapshot = await this.ensureSnapshot();
      await this.dependencies.projects.deleteProject(
        projectId,
        projectVersion(snapshot, projectId),
      );
      if (this.activeProjectId === projectId) this.activeProjectId = null;
      await this.reload();
      return this.currentWorkspace();
    });
  }

  async createTransaction(projectId: string, transaction: Transaction) {
    return this.mutate(async () => {
      await this.ensureSnapshot();
      await this.dependencies.transactions.createTransaction(
        projectId,
        transactionCreateInput(transaction),
      );
      await this.reload();
      return this.currentWorkspace();
    });
  }

  async updateTransaction(projectId: string, transactionId: string, patch: Partial<Transaction>) {
    return this.mutate(async () => {
      const snapshot = await this.ensureSnapshot();
      await this.dependencies.transactions.updateTransaction(
        projectId,
        transactionId,
        transactionVersion(snapshot, projectId, transactionId),
        transactionUpdateInput(patch),
      );
      await this.reload();
      return this.currentWorkspace();
    });
  }

  async deleteTransaction(projectId: string, transactionId: string) {
    return this.mutate(async () => {
      const snapshot = await this.ensureSnapshot();
      await this.dependencies.transactions.deleteTransaction(
        projectId,
        transactionId,
        transactionVersion(snapshot, projectId, transactionId),
      );
      await this.reload();
      return this.currentWorkspace();
    });
  }

  async importTransactions(command: FinancialImportCommand): Promise<WorkspaceMutation<Project>> {
    return this.mutate(async () => {
      const rows = importRows(command.transactions);
      const profile = importProfile(command);
      let projectId: string;
      if (command.destination.mode === "create-project") {
        const result = await this.dependencies.imports.applyInitialImport({
          idempotencyKey: command.idempotencyKey,
          project: { name: command.destination.newProjectName },
          file: command.file,
          profile,
          rows,
          confirmPossibleDuplicates: command.confirmPossibleDuplicates,
        });
        projectId = result.projectId;
      } else {
        const snapshot = await this.ensureSnapshot();
        projectId = command.destination.targetProjectId;
        await this.dependencies.imports.applyImportUpdate({
          idempotencyKey: command.idempotencyKey,
          projectId,
          baseProjectVersion: projectVersion(snapshot, projectId),
          file: command.file,
          profile,
          rows,
          confirmPossibleDuplicates: command.confirmPossibleDuplicates,
          confirmManualOverwrite: command.confirmManualOverwrite,
        });
      }
      this.activeProjectId = projectId;
      await this.reload();
      const project = this.snapshot!.projects.find(
        (item) => item.project.id === projectId,
      )?.project;
      if (!project)
        throw new FinancialRepositoryError("NOT_FOUND", "O projeto importado não está disponível.");
      return { workspace: this.currentWorkspace(), result: clone(project) };
    });
  }

  async updateProjectPreferences(projectId: string, patch: ProjectPreferencesPatch) {
    return this.mutate(async () => {
      const snapshot = await this.ensureSnapshot();
      projectVersion(snapshot, projectId);
      const current = snapshot.preferencesByProject[projectId];
      if (!current)
        throw new FinancialRepositoryError("NOT_FOUND", "O projeto não está disponível.");
      await this.dependencies.preferences.updateProjectPreferences(projectId, current.version, {
        visibleColumns: patch.visibleColumns ?? current.preferences.visibleColumns,
        analyticDimensions: patch.analyticDimensions ?? current.preferences.analyticDimensions,
      });
      await this.reload();
      return this.currentWorkspace();
    });
  }

  private async ensureSnapshot() {
    if (!this.snapshot) await this.reload();
    return this.snapshot!;
  }

  private async reload() {
    try {
      this.snapshot = await this.dependencies.workspace.loadWorkspaceSnapshot();
      if (
        this.activeProjectId &&
        !this.snapshot.projects.some(({ project }) => project.id === this.activeProjectId)
      ) {
        this.activeProjectId = null;
      }
    } catch (error) {
      this.snapshot = null;
      throw normalizeError(error);
    }
  }

  private currentWorkspace() {
    return this.snapshot
      ? financialWorkspace(this.snapshot, this.activeProjectId)
      : emptyFinancialWorkspace();
  }

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const queued = this.mutationQueue.then(async () => {
      try {
        return await operation();
      } catch (error) {
        const normalized = normalizeError(error);
        if (
          normalized.code === "CONFLICT" ||
          normalized.code === "NOT_FOUND" ||
          normalized.code === "UNAVAILABLE" ||
          normalized.code === "UNAUTHORIZED"
        ) {
          this.snapshot = null;
        }
        throw normalized;
      }
    });
    this.mutationQueue = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }
}

export function createRemoteFinancialRepository() {
  return new RemoteFinancialRepository({
    workspace: new SupabaseRemoteWorkspaceRepository(),
    projects: new RemoteProjectRepository(),
    transactions: new RemoteTransactionRepository(),
    imports: new RemoteImportRepository(),
    preferences: new RemoteProjectPreferencesRepository(),
  });
}
