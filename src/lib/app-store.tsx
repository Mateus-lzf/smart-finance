import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  FinancialRepository,
  FinancialWorkspace,
  FinancialImportCommand,
} from "./financial-repository";
import {
  DEFAULT_VISIBLE_COLUMNS,
  FinancialRepositoryError,
  emptyFinancialWorkspace,
} from "./financial-repository";
import type { ImportProfile, Project, ProjectInput, Transaction } from "./finance-types";
import type { FinancialMode } from "./financial-mode";
import { createFinancialRepositoryForMode } from "./financial-repository-factory";

export type FinancialStatus = "initializing" | "ready" | "error" | "unauthorized";

type AppState = {
  projects: Project[];
  projectId: string | null;
  project: Project | null;
  setProjectId: (id: string) => Promise<void>;
  createProject: (input: ProjectInput) => Promise<Project>;
  updateProject: (id: string, input: ProjectInput) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  getProjectTransactions: (id: string) => Transaction[];
  importProfile: ImportProfile | null;
  visibleColumns: string[];
  setVisibleColumns: (columns: string[]) => Promise<void>;
  analyticDimensions: string[];
  setAnalyticDimensions: (columns: string[]) => Promise<void>;
  commitImportedTransactions: (command: FinancialImportCommand) => Promise<Project>;
  onboarded: boolean;
  setOnboarded: (value: boolean) => void;
  aiOpen: boolean;
  setAiOpen: (value: boolean) => void;
  hydrated: boolean;
  financialMode: FinancialMode;
  financialStatus: FinancialStatus;
  financialError: string | null;
  retryFinancialWorkspace: () => Promise<void>;
  transactions: Transaction[];
  updateTransaction: (id: string, patch: Partial<Transaction>) => Promise<void>;
  addTransaction: (row: Transaction) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
};

const Ctx = createContext<AppState | null>(null);

export function AppProvider({
  children,
  userId,
  mode,
  repository: injectedRepository,
  repositoryFactory = createFinancialRepositoryForMode,
}: {
  children: ReactNode;
  userId: string;
  mode: FinancialMode;
  repository?: FinancialRepository;
  repositoryFactory?: (mode: FinancialMode, userId: string) => Promise<FinancialRepository>;
}) {
  const [repository, setRepository] = useState<FinancialRepository | null>(
    injectedRepository ?? null,
  );
  const [workspace, setWorkspace] = useState<FinancialWorkspace>(emptyFinancialWorkspace);
  const [onboarded, setOnboarded] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [financialStatus, setFinancialStatus] = useState<FinancialStatus>("initializing");
  const [financialError, setFinancialError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const applyWorkspace = useCallback((next: FinancialWorkspace) => {
    setWorkspace(next);
    setOnboarded(next.projects.length > 0);
  }, []);

  useEffect(() => {
    let active = true;
    setRepository(injectedRepository ?? null);
    setWorkspace(emptyFinancialWorkspace());
    setOnboarded(false);
    setHydrated(false);
    setFinancialStatus("initializing");
    setFinancialError(null);

    void Promise.resolve(injectedRepository ?? repositoryFactory(mode, userId))
      .then(async (nextRepository) => {
        if (!active) return;
        setRepository(nextRepository);
        const next = await nextRepository.loadWorkspace();
        if (active) {
          applyWorkspace(next);
          setFinancialStatus("ready");
          setHydrated(true);
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        setRepository(null);
        setFinancialStatus(
          error instanceof FinancialRepositoryError && error.code === "UNAUTHORIZED"
            ? "unauthorized"
            : "error",
        );
        setFinancialError(
          error instanceof FinancialRepositoryError
            ? error.message
            : "Não foi possível carregar seus dados financeiros.",
        );
      });
    return () => {
      active = false;
    };
  }, [applyWorkspace, injectedRepository, loadAttempt, mode, repositoryFactory, userId]);

  const retryFinancialWorkspace = useCallback(async () => {
    setLoadAttempt((attempt) => attempt + 1);
  }, []);

  const requireRepository = useCallback(() => {
    if (!repository || financialStatus !== "ready") {
      throw new FinancialRepositoryError(
        financialStatus === "unauthorized" ? "UNAUTHORIZED" : "UNAVAILABLE",
        financialStatus === "unauthorized"
          ? "Sua sessão expirou. Entre novamente para continuar."
          : "Os dados financeiros ainda não estão disponíveis.",
      );
    }
    return repository;
  }, [financialStatus, repository]);

  const runMutation = useCallback(
    async <T,>(operation: (currentRepository: FinancialRepository) => Promise<T>): Promise<T> => {
      const currentRepository = requireRepository();
      try {
        return await operation(currentRepository);
      } catch (error) {
        if (error instanceof FinancialRepositoryError && error.code === "CONFLICT") {
          try {
            applyWorkspace(await currentRepository.loadWorkspace());
          } catch (reloadError) {
            setWorkspace(emptyFinancialWorkspace());
            setOnboarded(false);
            setHydrated(false);
            setFinancialStatus(
              reloadError instanceof FinancialRepositoryError && reloadError.code === "UNAUTHORIZED"
                ? "unauthorized"
                : "error",
            );
            setFinancialError(
              reloadError instanceof FinancialRepositoryError
                ? reloadError.message
                : "Não foi possível atualizar seus dados financeiros.",
            );
          }
        } else if (error instanceof FinancialRepositoryError && error.code === "UNAUTHORIZED") {
          setWorkspace(emptyFinancialWorkspace());
          setOnboarded(false);
          setHydrated(false);
          setFinancialStatus("unauthorized");
          setFinancialError(error.message);
        }
        throw error;
      }
    },
    [applyWorkspace, requireRepository],
  );

  const setProjectId = useCallback(
    async (id: string) => applyWorkspace(await runMutation((current) => current.selectProject(id))),
    [applyWorkspace, runMutation],
  );
  const createProject = useCallback(
    async (input: ProjectInput) => {
      const mutation = await runMutation((current) => current.createProject(input));
      applyWorkspace(mutation.workspace);
      return mutation.result;
    },
    [applyWorkspace, runMutation],
  );
  const updateProject = useCallback(
    async (id: string, input: ProjectInput) =>
      applyWorkspace(await runMutation((current) => current.updateProject(id, input))),
    [applyWorkspace, runMutation],
  );
  const deleteProject = useCallback(
    async (id: string) => applyWorkspace(await runMutation((current) => current.deleteProject(id))),
    [applyWorkspace, runMutation],
  );
  const setVisibleColumns = useCallback(
    async (columns: string[]) => {
      if (!workspace.activeProjectId) return;
      applyWorkspace(
        await runMutation((current) =>
          current.updateProjectPreferences(workspace.activeProjectId!, {
            visibleColumns: columns,
          }),
        ),
      );
    },
    [applyWorkspace, runMutation, workspace.activeProjectId],
  );
  const setAnalyticDimensions = useCallback(
    async (columns: string[]) => {
      if (!workspace.activeProjectId) return;
      applyWorkspace(
        await runMutation((current) =>
          current.updateProjectPreferences(workspace.activeProjectId!, {
            analyticDimensions: columns,
          }),
        ),
      );
    },
    [applyWorkspace, runMutation, workspace.activeProjectId],
  );
  const commitImportedTransactions = useCallback(
    async (command: FinancialImportCommand) => {
      const mutation = await runMutation((current) => current.importTransactions(command));
      applyWorkspace(mutation.workspace);
      return mutation.result;
    },
    [applyWorkspace, runMutation],
  );
  const updateTransaction = useCallback(
    async (id: string, patch: Partial<Transaction>) => {
      if (!workspace.activeProjectId) throw new Error("Selecione um projeto para continuar.");
      applyWorkspace(
        await runMutation((current) =>
          current.updateTransaction(workspace.activeProjectId!, id, patch),
        ),
      );
    },
    [applyWorkspace, runMutation, workspace.activeProjectId],
  );
  const addTransaction = useCallback(
    async (row: Transaction) => {
      if (!workspace.activeProjectId) throw new Error("Selecione um projeto para continuar.");
      applyWorkspace(
        await runMutation((current) => current.createTransaction(workspace.activeProjectId!, row)),
      );
    },
    [applyWorkspace, runMutation, workspace.activeProjectId],
  );
  const deleteTransaction = useCallback(
    async (id: string) => {
      if (!workspace.activeProjectId) throw new Error("Selecione um projeto para continuar.");
      applyWorkspace(
        await runMutation((current) => current.deleteTransaction(workspace.activeProjectId!, id)),
      );
    },
    [applyWorkspace, runMutation, workspace.activeProjectId],
  );

  const getProjectTransactions = useCallback(
    (id: string) => workspace.transactionsByProject[id] ?? [],
    [workspace.transactionsByProject],
  );
  const project = workspace.projects.find((item) => item.id === workspace.activeProjectId) ?? null;
  const importProfile = workspace.activeProjectId
    ? (workspace.importProfilesByProject[workspace.activeProjectId] ?? null)
    : null;
  const visibleColumns = workspace.activeProjectId
    ? (workspace.visibleColumnsByProject[workspace.activeProjectId] ?? DEFAULT_VISIBLE_COLUMNS)
    : [];
  const analyticDimensions = workspace.activeProjectId
    ? (workspace.analyticDimensionsByProject[workspace.activeProjectId] ?? [])
    : [];
  const transactions = workspace.activeProjectId
    ? (workspace.transactionsByProject[workspace.activeProjectId] ?? [])
    : [];

  const value = useMemo<AppState>(
    () => ({
      projects: workspace.projects,
      projectId: workspace.activeProjectId,
      project,
      setProjectId,
      createProject,
      updateProject,
      deleteProject,
      getProjectTransactions,
      importProfile,
      visibleColumns,
      setVisibleColumns,
      analyticDimensions,
      setAnalyticDimensions,
      commitImportedTransactions,
      onboarded,
      setOnboarded,
      aiOpen,
      setAiOpen,
      hydrated,
      financialMode: mode,
      financialStatus,
      financialError,
      retryFinancialWorkspace,
      transactions,
      updateTransaction,
      addTransaction,
      deleteTransaction,
    }),
    [
      workspace.projects,
      workspace.activeProjectId,
      project,
      setProjectId,
      createProject,
      updateProject,
      deleteProject,
      getProjectTransactions,
      importProfile,
      visibleColumns,
      setVisibleColumns,
      analyticDimensions,
      setAnalyticDimensions,
      commitImportedTransactions,
      onboarded,
      aiOpen,
      hydrated,
      mode,
      financialStatus,
      financialError,
      retryFinancialWorkspace,
      transactions,
      updateTransaction,
      addTransaction,
      deleteTransaction,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
