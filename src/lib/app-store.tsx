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
import { createBrowserActiveProjectPreference } from "./active-project-preference";

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
  const activeProjectPreference = useMemo(
    () => (mode === "remote" ? createBrowserActiveProjectPreference(userId) : null),
    [mode, userId],
  );

  const applyWorkspace = useCallback((next: FinancialWorkspace) => {
    setWorkspace(next);
    setOnboarded(next.projects.length > 0);
  }, []);

  const applyRemoteActiveProjectPreference = useCallback(
    async (currentRepository: FinancialRepository, next: FinancialWorkspace) => {
      if (!activeProjectPreference) return next;
      const persistedProjectId = activeProjectPreference.load();
      return persistedProjectId &&
        persistedProjectId !== next.activeProjectId &&
        next.projects.some((project) => project.id === persistedProjectId)
        ? currentRepository.selectProject(persistedProjectId)
        : next;
    },
    [activeProjectPreference],
  );

  const applyWorkspaceAndPreference = useCallback(
    (next: FinancialWorkspace) => {
      activeProjectPreference?.persist(next.activeProjectId);
      applyWorkspace(next);
    },
    [activeProjectPreference, applyWorkspace],
  );

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
        const next = await applyRemoteActiveProjectPreference(
          nextRepository,
          await nextRepository.loadWorkspace(),
        );
        if (active) {
          applyWorkspaceAndPreference(next);
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
  }, [
    applyRemoteActiveProjectPreference,
    applyWorkspaceAndPreference,
    injectedRepository,
    loadAttempt,
    mode,
    repositoryFactory,
    userId,
  ]);

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
            applyWorkspaceAndPreference(await currentRepository.loadWorkspace());
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
    [applyWorkspaceAndPreference, requireRepository],
  );

  const setProjectId = useCallback(
    async (id: string) =>
      applyWorkspaceAndPreference(await runMutation((current) => current.selectProject(id))),
    [applyWorkspaceAndPreference, runMutation],
  );
  const createProject = useCallback(
    async (input: ProjectInput) => {
      const mutation = await runMutation((current) => current.createProject(input));
      applyWorkspaceAndPreference(mutation.workspace);
      return mutation.result;
    },
    [applyWorkspaceAndPreference, runMutation],
  );
  const updateProject = useCallback(
    async (id: string, input: ProjectInput) =>
      applyWorkspaceAndPreference(await runMutation((current) => current.updateProject(id, input))),
    [applyWorkspaceAndPreference, runMutation],
  );
  const deleteProject = useCallback(
    async (id: string) =>
      applyWorkspaceAndPreference(await runMutation((current) => current.deleteProject(id))),
    [applyWorkspaceAndPreference, runMutation],
  );
  const setVisibleColumns = useCallback(
    async (columns: string[]) => {
      if (!workspace.activeProjectId) return;
      applyWorkspaceAndPreference(
        await runMutation((current) =>
          current.updateProjectPreferences(workspace.activeProjectId!, {
            visibleColumns: columns,
          }),
        ),
      );
    },
    [applyWorkspaceAndPreference, runMutation, workspace.activeProjectId],
  );
  const setAnalyticDimensions = useCallback(
    async (columns: string[]) => {
      if (!workspace.activeProjectId) return;
      applyWorkspaceAndPreference(
        await runMutation((current) =>
          current.updateProjectPreferences(workspace.activeProjectId!, {
            analyticDimensions: columns,
          }),
        ),
      );
    },
    [applyWorkspaceAndPreference, runMutation, workspace.activeProjectId],
  );
  const commitImportedTransactions = useCallback(
    async (command: FinancialImportCommand) => {
      const mutation = await runMutation((current) => current.importTransactions(command));
      applyWorkspaceAndPreference(mutation.workspace);
      return mutation.result;
    },
    [applyWorkspaceAndPreference, runMutation],
  );
  const updateTransaction = useCallback(
    async (id: string, patch: Partial<Transaction>) => {
      if (!workspace.activeProjectId) throw new Error("Selecione um projeto para continuar.");
      applyWorkspaceAndPreference(
        await runMutation((current) =>
          current.updateTransaction(workspace.activeProjectId!, id, patch),
        ),
      );
    },
    [applyWorkspaceAndPreference, runMutation, workspace.activeProjectId],
  );
  const addTransaction = useCallback(
    async (row: Transaction) => {
      if (!workspace.activeProjectId) throw new Error("Selecione um projeto para continuar.");
      applyWorkspaceAndPreference(
        await runMutation((current) => current.createTransaction(workspace.activeProjectId!, row)),
      );
    },
    [applyWorkspaceAndPreference, runMutation, workspace.activeProjectId],
  );
  const deleteTransaction = useCallback(
    async (id: string) => {
      if (!workspace.activeProjectId) throw new Error("Selecione um projeto para continuar.");
      applyWorkspaceAndPreference(
        await runMutation((current) => current.deleteTransaction(workspace.activeProjectId!, id)),
      );
    },
    [applyWorkspaceAndPreference, runMutation, workspace.activeProjectId],
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
