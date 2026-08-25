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
import { DEFAULT_VISIBLE_COLUMNS, emptyFinancialWorkspace } from "./financial-repository";
import type { ImportProfile, Project, ProjectInput, Transaction } from "./finance-types";
import { createLocalFinancialRepository } from "./local-financial-repository";

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
  transactions: Transaction[];
  updateTransaction: (id: string, patch: Partial<Transaction>) => Promise<void>;
  addTransaction: (row: Transaction) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
};

const Ctx = createContext<AppState | null>(null);

export function AppProvider({
  children,
  userId,
  repository: injectedRepository,
}: {
  children: ReactNode;
  userId: string;
  repository?: FinancialRepository;
}) {
  const repository = useMemo(
    () => injectedRepository ?? createLocalFinancialRepository(userId),
    [injectedRepository, userId],
  );
  const [workspace, setWorkspace] = useState<FinancialWorkspace>(emptyFinancialWorkspace);
  const [onboarded, setOnboarded] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const applyWorkspace = useCallback((next: FinancialWorkspace) => {
    setWorkspace(next);
    setOnboarded(next.projects.length > 0);
  }, []);

  useEffect(() => {
    let active = true;
    setHydrated(false);
    void repository
      .loadWorkspace()
      .then((next) => {
        if (active) applyWorkspace(next);
      })
      .catch(() => {
        if (active) applyWorkspace(emptyFinancialWorkspace());
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, [applyWorkspace, repository]);

  const setProjectId = useCallback(
    async (id: string) => applyWorkspace(await repository.selectProject(id)),
    [applyWorkspace, repository],
  );
  const createProject = useCallback(
    async (input: ProjectInput) => {
      const mutation = await repository.createProject(input);
      applyWorkspace(mutation.workspace);
      return mutation.result;
    },
    [applyWorkspace, repository],
  );
  const updateProject = useCallback(
    async (id: string, input: ProjectInput) =>
      applyWorkspace(await repository.updateProject(id, input)),
    [applyWorkspace, repository],
  );
  const deleteProject = useCallback(
    async (id: string) => applyWorkspace(await repository.deleteProject(id)),
    [applyWorkspace, repository],
  );
  const setVisibleColumns = useCallback(
    async (columns: string[]) => {
      if (!workspace.activeProjectId) return;
      applyWorkspace(
        await repository.updateProjectPreferences(workspace.activeProjectId, {
          visibleColumns: columns,
        }),
      );
    },
    [applyWorkspace, repository, workspace.activeProjectId],
  );
  const setAnalyticDimensions = useCallback(
    async (columns: string[]) => {
      if (!workspace.activeProjectId) return;
      applyWorkspace(
        await repository.updateProjectPreferences(workspace.activeProjectId, {
          analyticDimensions: columns,
        }),
      );
    },
    [applyWorkspace, repository, workspace.activeProjectId],
  );
  const commitImportedTransactions = useCallback(
    async (command: FinancialImportCommand) => {
      const mutation = await repository.importTransactions(command);
      applyWorkspace(mutation.workspace);
      return mutation.result;
    },
    [applyWorkspace, repository],
  );
  const updateTransaction = useCallback(
    async (id: string, patch: Partial<Transaction>) => {
      if (!workspace.activeProjectId) throw new Error("Selecione um projeto para continuar.");
      applyWorkspace(await repository.updateTransaction(workspace.activeProjectId, id, patch));
    },
    [applyWorkspace, repository, workspace.activeProjectId],
  );
  const addTransaction = useCallback(
    async (row: Transaction) => {
      if (!workspace.activeProjectId) throw new Error("Selecione um projeto para continuar.");
      applyWorkspace(await repository.createTransaction(workspace.activeProjectId, row));
    },
    [applyWorkspace, repository, workspace.activeProjectId],
  );
  const deleteTransaction = useCallback(
    async (id: string) => {
      if (!workspace.activeProjectId) throw new Error("Selecione um projeto para continuar.");
      applyWorkspace(await repository.deleteTransaction(workspace.activeProjectId, id));
    },
    [applyWorkspace, repository, workspace.activeProjectId],
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
