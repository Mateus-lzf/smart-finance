import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ImportProfile, Project, ProjectInput, Transaction } from "./finance-types";
import {
  deleteProjectFromLocalState,
  getUserLocalStateKey,
  loadUserLocalState,
  persistLocalState,
  replaceProjectTransactionsInLocalState,
  type LocalState,
} from "./local-state-service";
import { createLocalProject, updateLocalProject } from "./project-service";
import {
  addLocalTransaction,
  deleteLocalTransaction,
  updateLocalTransaction,
} from "./transaction-service";

type AppState = {
  projects: Project[];
  projectId: string | null;
  project: Project | null;
  setProjectId: (id: string) => void;
  createProject: (input: ProjectInput) => Project;
  updateProject: (id: string, input: ProjectInput) => void;
  deleteProject: (id: string) => void;
  getProjectTransactions: (id: string) => Transaction[];
  importProfile: ImportProfile | null;
  visibleColumns: string[];
  setVisibleColumns: (columns: string[]) => void;
  analyticDimensions: string[];
  setAnalyticDimensions: (columns: string[]) => void;
  commitImportedTransactions: (
    rows: Transaction[],
    profile: ImportProfile,
    destination:
      | { mode: "replace-project"; targetProjectId: string }
      | { mode: "create-project"; newProjectName: string },
  ) => Project;
  onboarded: boolean;
  setOnboarded: (value: boolean) => void;
  aiOpen: boolean;
  setAiOpen: (value: boolean) => void;
  hydrated: boolean;
  transactions: Transaction[];
  updateTransaction: (id: string, patch: Partial<Transaction>) => void;
  addTransaction: (row: Transaction) => void;
  deleteTransaction: (id: string) => void;
};

const Ctx = createContext<AppState | null>(null);
const DEFAULT_VISIBLE_COLUMNS = ["date", "description", "category", "type", "amount"];

export function AppProvider({ children, userId }: { children: ReactNode; userId: string }) {
  const storageKey = useMemo(() => getUserLocalStateKey(userId), [userId]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectIdState] = useState<string | null>(null);
  const [transactionsByProject, setTransactionsByProject] = useState<Record<string, Transaction[]>>(
    {},
  );
  const [importProfilesByProject, setImportProfilesByProject] = useState<
    Record<string, ImportProfile>
  >({});
  const [visibleColumnsByProject, setVisibleColumnsByProject] = useState<Record<string, string[]>>(
    {},
  );
  const [analyticDimensionsByProject, setAnalyticDimensionsByProject] = useState<
    Record<string, string[]>
  >({});
  const [onboarded, setOnboarded] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const state = loadUserLocalState(localStorage, userId);
      if (state) {
        const storedProjects = state.projects;
        setProjects(storedProjects);
        setTransactionsByProject(state.transactionsByProject);
        setImportProfilesByProject(state.importProfilesByProject);
        setVisibleColumnsByProject(state.visibleColumnsByProject);
        setAnalyticDimensionsByProject(state.analyticDimensionsByProject);
        const activeId = storedProjects.some((project) => project.id === state.activeProjectId)
          ? (state.activeProjectId ?? null)
          : (storedProjects[0]?.id ?? null);
        setProjectIdState(activeId);
        setOnboarded(storedProjects.length > 0);
      }
    } catch {
      // Invalid local data is ignored and the product starts empty.
    }
    setHydrated(true);
  }, [storageKey, userId]);

  useEffect(() => {
    if (!hydrated) return;
    const state: LocalState = {
      projects,
      activeProjectId: projectId,
      transactionsByProject,
      importProfilesByProject,
      visibleColumnsByProject,
      analyticDimensionsByProject,
    };
    try {
      persistLocalState(localStorage, state, storageKey);
    } catch {
      // The current session keeps working if storage is unavailable or full.
    }
  }, [
    projects,
    projectId,
    transactionsByProject,
    importProfilesByProject,
    visibleColumnsByProject,
    analyticDimensionsByProject,
    hydrated,
    storageKey,
  ]);

  const setProjectId = useCallback(
    (id: string) => {
      if (projects.some((project) => project.id === id)) setProjectIdState(id);
    },
    [projects],
  );

  const createProject = useCallback((input: ProjectInput) => {
    const project = createLocalProject(input);
    setProjects((current) => [...current, project]);
    setTransactionsByProject((current) => ({ ...current, [project.id]: [] }));
    setVisibleColumnsByProject((current) => ({
      ...current,
      [project.id]: DEFAULT_VISIBLE_COLUMNS,
    }));
    setAnalyticDimensionsByProject((current) => ({ ...current, [project.id]: [] }));
    setProjectIdState(project.id);
    setOnboarded(true);
    return project;
  }, []);

  const updateProject = useCallback((id: string, input: ProjectInput) => {
    setProjects((current) =>
      current.map((project) => (project.id === id ? updateLocalProject(project, input) : project)),
    );
  }, []);

  const deleteProject = useCallback(
    (id: string) => {
      const next = deleteProjectFromLocalState(
        {
          projects,
          activeProjectId: projectId,
          transactionsByProject,
          importProfilesByProject,
          visibleColumnsByProject,
          analyticDimensionsByProject,
        },
        id,
      );
      try {
        persistLocalState(localStorage, next, storageKey);
      } catch {
        // React state remains authoritative when storage is unavailable.
      }
      setProjects(next.projects);
      setProjectIdState(next.activeProjectId);
      setTransactionsByProject(next.transactionsByProject);
      setImportProfilesByProject(next.importProfilesByProject);
      setVisibleColumnsByProject(next.visibleColumnsByProject);
      setAnalyticDimensionsByProject(next.analyticDimensionsByProject);
      setOnboarded(next.projects.length > 0);
    },
    [
      projects,
      projectId,
      transactionsByProject,
      importProfilesByProject,
      visibleColumnsByProject,
      analyticDimensionsByProject,
      storageKey,
    ],
  );

  const setVisibleColumns = useCallback(
    (columns: string[]) => {
      if (!projectId) return;
      setVisibleColumnsByProject((current) => ({ ...current, [projectId]: columns }));
    },
    [projectId],
  );

  const setAnalyticDimensions = useCallback(
    (columns: string[]) => {
      if (!projectId) return;
      setAnalyticDimensionsByProject((current) => ({ ...current, [projectId]: columns }));
    },
    [projectId],
  );

  const commitImportedTransactions = useCallback(
    (
      rows: Transaction[],
      profile: ImportProfile,
      destination:
        | { mode: "replace-project"; targetProjectId: string }
        | { mode: "create-project"; newProjectName: string },
    ) => {
      const existingId =
        destination.mode === "replace-project" ? destination.targetProjectId : null;
      const created = existingId
        ? null
        : createLocalProject({
            name: destination.mode === "create-project" ? destination.newProjectName.trim() : "",
          });
      if (existingId && !projects.some((item) => item.id === existingId))
        throw new Error("O projeto selecionado não está mais disponível.");
      if (created && !created.name) throw new Error("Informe o nome do novo projeto.");
      const id = existingId ?? created!.id;
      const now = new Date().toISOString();
      const nextProjects = created
        ? [...projects, created]
        : projects.map((item) => (item.id === id ? { ...item, updatedAt: now } : item));
      const next: LocalState = {
        projects: nextProjects,
        activeProjectId: id,
        transactionsByProject: { ...transactionsByProject, [id]: rows },
        importProfilesByProject: { ...importProfilesByProject, [id]: profile },
        visibleColumnsByProject: {
          ...visibleColumnsByProject,
          [id]: visibleColumnsByProject[id] ?? DEFAULT_VISIBLE_COLUMNS,
        },
        analyticDimensionsByProject: {
          ...analyticDimensionsByProject,
          [id]: (analyticDimensionsByProject[id] ?? []).filter((columnId) =>
            profile.columns?.some((column) => column.id === columnId),
          ),
        },
      };
      try {
        persistLocalState(localStorage, next, storageKey);
      } catch (cause) {
        const error = new Error(
          "Não há capacidade de armazenamento local suficiente. Os dados atuais foram mantidos intactos.",
        );
        error.cause = cause;
        throw error;
      }
      setProjects(next.projects);
      setProjectIdState(id);
      setTransactionsByProject(next.transactionsByProject);
      setImportProfilesByProject(next.importProfilesByProject);
      setVisibleColumnsByProject(next.visibleColumnsByProject);
      setAnalyticDimensionsByProject(next.analyticDimensionsByProject);
      setOnboarded(true);
      return next.projects.find((item) => item.id === id)!;
    },
    [
      projects,
      transactionsByProject,
      importProfilesByProject,
      visibleColumnsByProject,
      analyticDimensionsByProject,
      storageKey,
    ],
  );

  const commitTransactionRows = useCallback(
    (rows: Transaction[]) => {
      if (!projectId) throw new Error("Selecione um projeto para continuar.");
      const current: LocalState = {
        projects,
        activeProjectId: projectId,
        transactionsByProject,
        importProfilesByProject,
        visibleColumnsByProject,
        analyticDimensionsByProject,
      };
      const next = replaceProjectTransactionsInLocalState(current, projectId, rows);
      try {
        persistLocalState(localStorage, next, storageKey);
      } catch (cause) {
        const error = new Error(
          "Não foi possível salvar no armazenamento local. A alteração não foi aplicada.",
        );
        error.cause = cause;
        throw error;
      }
      setProjects(next.projects);
      setTransactionsByProject(next.transactionsByProject);
    },
    [
      projectId,
      projects,
      transactionsByProject,
      importProfilesByProject,
      visibleColumnsByProject,
      analyticDimensionsByProject,
      storageKey,
    ],
  );

  const updateTransaction = useCallback(
    (id: string, patch: Partial<Transaction>) => {
      if (!projectId) throw new Error("Selecione um projeto para continuar.");
      commitTransactionRows(
        updateLocalTransaction(transactionsByProject[projectId] ?? [], id, patch),
      );
    },
    [projectId, transactionsByProject, commitTransactionRows],
  );

  const addTransaction = useCallback(
    (row: Transaction) => {
      if (!projectId) throw new Error("Selecione um projeto para continuar.");
      const current = transactionsByProject[projectId] ?? [];
      if (current.some((item) => item.id === row.id))
        throw new Error("Não foi possível gerar um identificador único para o lançamento.");
      commitTransactionRows(addLocalTransaction(current, row));
    },
    [projectId, transactionsByProject, commitTransactionRows],
  );

  const deleteTransaction = useCallback(
    (id: string) => {
      if (!projectId) throw new Error("Selecione um projeto para continuar.");
      commitTransactionRows(deleteLocalTransaction(transactionsByProject[projectId] ?? [], id));
    },
    [projectId, transactionsByProject, commitTransactionRows],
  );

  const getProjectTransactions = useCallback(
    (id: string) => transactionsByProject[id] ?? [],
    [transactionsByProject],
  );
  const project = projects.find((item) => item.id === projectId) ?? null;
  const importProfile = projectId ? (importProfilesByProject[projectId] ?? null) : null;
  const visibleColumns = useMemo(
    () => (projectId ? (visibleColumnsByProject[projectId] ?? DEFAULT_VISIBLE_COLUMNS) : []),
    [projectId, visibleColumnsByProject],
  );
  const analyticDimensions = useMemo(
    () => (projectId ? (analyticDimensionsByProject[projectId] ?? []) : []),
    [projectId, analyticDimensionsByProject],
  );
  const transactions = useMemo(
    () => (projectId ? (transactionsByProject[projectId] ?? []) : []),
    [projectId, transactionsByProject],
  );

  const value = useMemo<AppState>(
    () => ({
      projects,
      projectId,
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
      projects,
      projectId,
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
