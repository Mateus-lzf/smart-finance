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
  LOCAL_STATE_KEY,
  parseLocalState,
  serializeLocalState,
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
  setImportProfile: (profile: ImportProfile, targetProjectId?: string) => void;
  onboarded: boolean;
  setOnboarded: (value: boolean) => void;
  aiOpen: boolean;
  setAiOpen: (value: boolean) => void;
  hydrated: boolean;
  transactions: Transaction[];
  replaceTransactions: (rows: Transaction[], targetProjectId?: string) => void;
  updateTransaction: (id: string, patch: Partial<Transaction>) => void;
  addTransaction: (row: Transaction) => void;
  deleteTransaction: (id: string) => void;
};

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectIdState] = useState<string | null>(null);
  const [transactionsByProject, setTransactionsByProject] = useState<Record<string, Transaction[]>>(
    {},
  );
  const [importProfilesByProject, setImportProfilesByProject] = useState<
    Record<string, ImportProfile>
  >({});
  const [onboarded, setOnboarded] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      localStorage.removeItem("fin.state");
      const raw = localStorage.getItem(LOCAL_STATE_KEY);
      if (raw) {
        const state = parseLocalState(raw);
        const storedProjects = state.projects;
        setProjects(storedProjects);
        setTransactionsByProject(state.transactionsByProject);
        setImportProfilesByProject(state.importProfilesByProject);
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
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const state: LocalState = {
      projects,
      activeProjectId: projectId,
      transactionsByProject,
      importProfilesByProject,
    };
    try {
      localStorage.setItem(LOCAL_STATE_KEY, serializeLocalState(state));
    } catch {
      // The current session keeps working if storage is unavailable or full.
    }
  }, [projects, projectId, transactionsByProject, importProfilesByProject, hydrated]);

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
    setProjectIdState(project.id);
    setOnboarded(true);
    return project;
  }, []);

  const updateProject = useCallback((id: string, input: ProjectInput) => {
    setProjects((current) =>
      current.map((project) => (project.id === id ? updateLocalProject(project, input) : project)),
    );
  }, []);

  const deleteProject = useCallback((id: string) => {
    setProjects((current) => {
      const next = current.filter((project) => project.id !== id);
      setProjectIdState((activeId) => (activeId === id ? (next[0]?.id ?? null) : activeId));
      setOnboarded(next.length > 0);
      return next;
    });
    setTransactionsByProject((current) => {
      const { [id]: removed, ...next } = current;
      void removed;
      return next;
    });
    setImportProfilesByProject((current) => {
      const { [id]: removed, ...next } = current;
      void removed;
      return next;
    });
  }, []);

  const setImportProfile = useCallback(
    (profile: ImportProfile, targetProjectId?: string) => {
      const id = targetProjectId ?? projectId;
      if (!id) return;
      setImportProfilesByProject((current) => ({ ...current, [id]: profile }));
    },
    [projectId],
  );

  const replaceTransactions = useCallback(
    (rows: Transaction[], targetProjectId?: string) => {
      const id = targetProjectId ?? projectId;
      if (!id) return;
      setTransactionsByProject((current) => ({ ...current, [id]: rows }));
      setProjects((current) =>
        current.map((project) =>
          project.id === id ? { ...project, updatedAt: new Date().toISOString() } : project,
        ),
      );
    },
    [projectId],
  );

  const updateTransaction = useCallback(
    (id: string, patch: Partial<Transaction>) => {
      if (!projectId) return;
      setTransactionsByProject((current) => ({
        ...current,
        [projectId]: updateLocalTransaction(current[projectId] ?? [], id, patch),
      }));
      setProjects((current) =>
        current.map((project) =>
          project.id === projectId ? { ...project, updatedAt: new Date().toISOString() } : project,
        ),
      );
    },
    [projectId],
  );

  const addTransaction = useCallback(
    (row: Transaction) => {
      if (!projectId) return;
      setTransactionsByProject((current) => ({
        ...current,
        [projectId]: addLocalTransaction(current[projectId] ?? [], row),
      }));
      setProjects((current) =>
        current.map((project) =>
          project.id === projectId ? { ...project, updatedAt: new Date().toISOString() } : project,
        ),
      );
    },
    [projectId],
  );

  const deleteTransaction = useCallback(
    (id: string) => {
      if (!projectId) return;
      setTransactionsByProject((current) => ({
        ...current,
        [projectId]: deleteLocalTransaction(current[projectId] ?? [], id),
      }));
      setProjects((current) =>
        current.map((project) =>
          project.id === projectId ? { ...project, updatedAt: new Date().toISOString() } : project,
        ),
      );
    },
    [projectId],
  );

  const getProjectTransactions = useCallback(
    (id: string) => transactionsByProject[id] ?? [],
    [transactionsByProject],
  );
  const project = projects.find((item) => item.id === projectId) ?? null;
  const importProfile = projectId ? (importProfilesByProject[projectId] ?? null) : null;
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
      setImportProfile,
      onboarded,
      setOnboarded,
      aiOpen,
      setAiOpen,
      hydrated,
      transactions,
      replaceTransactions,
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
      setImportProfile,
      onboarded,
      aiOpen,
      hydrated,
      transactions,
      replaceTransactions,
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
