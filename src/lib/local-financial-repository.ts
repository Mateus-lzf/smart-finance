import type {
  FinancialRepository,
  FinancialWorkspace,
  FinancialImportCommand,
  ProjectPreferencesPatch,
  WorkspaceMutation,
} from "./financial-repository";
import { DEFAULT_VISIBLE_COLUMNS, emptyFinancialWorkspace } from "./financial-repository";
import type { ImportProfile, Project, ProjectInput, Transaction } from "./finance-types";
import {
  deleteProjectFromLocalState,
  getUserLocalStateKey,
  loadUserLocalState,
  persistLocalState,
  replaceProjectTransactionsInLocalState,
} from "./local-state-service";
import { createLocalProject, updateLocalProject } from "./project-service";
import {
  addLocalTransaction,
  deleteLocalTransaction,
  updateLocalTransaction,
} from "./transaction-service";
import { compareTransactionUpdates } from "./transaction-update-service";

type LocalStoragePort = Pick<Storage, "getItem" | "setItem">;

function cloneWorkspace(workspace: FinancialWorkspace): FinancialWorkspace {
  return structuredClone(workspace);
}

export class LocalFinancialRepository implements FinancialRepository {
  private workspace = emptyFinancialWorkspace();
  private mutationQueue: Promise<void> = Promise.resolve();
  private readonly storageKey: string;

  constructor(
    private readonly userId: string,
    private readonly storage: LocalStoragePort,
  ) {
    this.storageKey = getUserLocalStateKey(userId);
  }

  async loadWorkspace() {
    const stored = loadUserLocalState(this.storage, this.userId);
    const workspace = stored ?? emptyFinancialWorkspace();
    const activeProjectId = workspace.projects.some(
      (project) => project.id === workspace.activeProjectId,
    )
      ? workspace.activeProjectId
      : (workspace.projects[0]?.id ?? null);
    this.workspace = cloneWorkspace({ ...workspace, activeProjectId });
    return cloneWorkspace(this.workspace);
  }

  async selectProject(projectId: string) {
    return this.mutate((current) => {
      if (!current.projects.some((project) => project.id === projectId)) {
        throw new Error("O projeto selecionado não está mais disponível.");
      }
      return { ...current, activeProjectId: projectId };
    });
  }

  async createProject(input: ProjectInput): Promise<WorkspaceMutation<Project>> {
    let project!: Project;
    const workspace = await this.mutate((current) => {
      project = createLocalProject(input);
      if (!project.name) throw new Error("Informe o nome do novo projeto.");
      return {
        ...current,
        projects: [...current.projects, project],
        activeProjectId: project.id,
        transactionsByProject: { ...current.transactionsByProject, [project.id]: [] },
        visibleColumnsByProject: {
          ...current.visibleColumnsByProject,
          [project.id]: DEFAULT_VISIBLE_COLUMNS,
        },
        analyticDimensionsByProject: {
          ...current.analyticDimensionsByProject,
          [project.id]: [],
        },
      };
    });
    return { workspace, result: project };
  }

  async updateProject(projectId: string, input: ProjectInput) {
    return this.mutate((current) => {
      if (!input.name.trim()) throw new Error("Informe o nome do projeto.");
      if (!current.projects.some((project) => project.id === projectId)) {
        throw new Error("O projeto selecionado não está mais disponível.");
      }
      return {
        ...current,
        projects: current.projects.map((project) =>
          project.id === projectId ? updateLocalProject(project, input) : project,
        ),
      };
    });
  }

  async deleteProject(projectId: string) {
    return this.mutate((current) => deleteProjectFromLocalState(current, projectId));
  }

  async createTransaction(projectId: string, transaction: Transaction) {
    return this.mutate((current) => {
      const rows = current.transactionsByProject[projectId] ?? [];
      if (rows.some((item) => item.id === transaction.id)) {
        throw new Error("Não foi possível gerar um identificador único para o lançamento.");
      }
      return replaceProjectTransactionsInLocalState(
        current,
        projectId,
        addLocalTransaction(rows, transaction),
      );
    });
  }

  async updateTransaction(projectId: string, transactionId: string, patch: Partial<Transaction>) {
    return this.mutate((current) =>
      replaceProjectTransactionsInLocalState(
        current,
        projectId,
        updateLocalTransaction(
          current.transactionsByProject[projectId] ?? [],
          transactionId,
          patch,
        ),
      ),
    );
  }

  async deleteTransaction(projectId: string, transactionId: string) {
    return this.mutate((current) =>
      replaceProjectTransactionsInLocalState(
        current,
        projectId,
        deleteLocalTransaction(current.transactionsByProject[projectId] ?? [], transactionId),
      ),
    );
  }

  async importTransactions(command: FinancialImportCommand): Promise<WorkspaceMutation<Project>> {
    const { transactions, profile, destination } = command;
    let importedProject!: Project;
    const workspace = await this.mutate((current) => {
      const existingId =
        destination.mode === "replace-project" ? destination.targetProjectId : null;
      const created =
        destination.mode === "create-project"
          ? createLocalProject({ name: destination.newProjectName.trim() })
          : null;
      if (existingId && !current.projects.some((project) => project.id === existingId)) {
        throw new Error("O projeto selecionado não está mais disponível.");
      }
      if (created && !created.name) throw new Error("Informe o nome do novo projeto.");
      const projectId = existingId ?? created!.id;
      const nextTransactions = existingId
        ? compareTransactionUpdates(current.transactionsByProject[projectId] ?? [], transactions)
            .nextTransactions
        : transactions;
      const now = new Date().toISOString();
      const projects = created
        ? [...current.projects, created]
        : current.projects.map((project) =>
            project.id === projectId ? { ...project, updatedAt: now } : project,
          );
      importedProject = projects.find((project) => project.id === projectId)!;
      return {
        projects,
        activeProjectId: projectId,
        transactionsByProject: { ...current.transactionsByProject, [projectId]: nextTransactions },
        importProfilesByProject: { ...current.importProfilesByProject, [projectId]: profile },
        visibleColumnsByProject: {
          ...current.visibleColumnsByProject,
          [projectId]: current.visibleColumnsByProject[projectId] ?? DEFAULT_VISIBLE_COLUMNS,
        },
        analyticDimensionsByProject: {
          ...current.analyticDimensionsByProject,
          [projectId]: (current.analyticDimensionsByProject[projectId] ?? []).filter((columnId) =>
            profile.columns?.some((column) => column.id === columnId),
          ),
        },
      };
    }, "Não há capacidade de armazenamento local suficiente. Os dados atuais foram mantidos intactos.");
    return { workspace, result: importedProject };
  }

  async updateProjectPreferences(projectId: string, patch: ProjectPreferencesPatch) {
    return this.mutate((current) => {
      if (!current.projects.some((project) => project.id === projectId)) {
        throw new Error("O projeto selecionado não está mais disponível.");
      }
      return {
        ...current,
        visibleColumnsByProject: patch.visibleColumns
          ? { ...current.visibleColumnsByProject, [projectId]: [...patch.visibleColumns] }
          : current.visibleColumnsByProject,
        analyticDimensionsByProject: patch.analyticDimensions
          ? {
              ...current.analyticDimensionsByProject,
              [projectId]: [...patch.analyticDimensions],
            }
          : current.analyticDimensionsByProject,
      };
    });
  }

  private mutate(
    createNext: (current: FinancialWorkspace) => FinancialWorkspace,
    persistenceMessage = "Não foi possível salvar no armazenamento local. A alteração não foi aplicada.",
  ): Promise<FinancialWorkspace> {
    const operation = this.mutationQueue.then(() => {
      const next = createNext(cloneWorkspace(this.workspace));
      try {
        persistLocalState(this.storage, next, this.storageKey);
      } catch (cause) {
        const error = new Error(persistenceMessage);
        error.cause = cause;
        throw error;
      }
      this.workspace = cloneWorkspace(next);
      return cloneWorkspace(this.workspace);
    });
    this.mutationQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }
}

export function createLocalFinancialRepository(userId: string): FinancialRepository {
  return new LocalFinancialRepository(userId, localStorage);
}
