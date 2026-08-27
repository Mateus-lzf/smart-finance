const ACTIVE_PROJECT_KEY_PREFIX = "smart-finance.active-project.v1.user";

type ActiveProjectStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type ActiveProjectPreference = {
  load(): string | null;
  persist(projectId: string | null): void;
};

function activeProjectKey(userId: string) {
  return `${ACTIVE_PROJECT_KEY_PREFIX}.${encodeURIComponent(userId)}`;
}

export function loadActiveProjectPreference(storage: ActiveProjectStorage, userId: string) {
  return storage.getItem(activeProjectKey(userId));
}

export function persistActiveProjectPreference(
  storage: ActiveProjectStorage,
  userId: string,
  projectId: string | null,
) {
  const key = activeProjectKey(userId);
  if (projectId) storage.setItem(key, projectId);
  else storage.removeItem(key);
}

export function createBrowserActiveProjectPreference(
  userId: string,
  storage: ActiveProjectStorage = window.localStorage,
): ActiveProjectPreference {
  return {
    load() {
      try {
        return loadActiveProjectPreference(storage, userId);
      } catch {
        return null;
      }
    },
    persist(projectId) {
      try {
        persistActiveProjectPreference(storage, userId, projectId);
      } catch {
        // This device-only UI preference must never invalidate a committed financial mutation.
      }
    },
  };
}
