import { DEFAULT_VISIBLE_COLUMNS } from "../financial-repository";

export type ProjectPreferences = {
  visibleColumns: string[];
  analyticDimensions: string[];
};

export type VersionedProjectPreferences = {
  preferences: ProjectPreferences;
  version: number | null;
  exists: boolean;
};

export type ProjectPreferencesInput = ProjectPreferences;

export type ProjectPreferencesRepositoryErrorCode =
  "PROJECT_NOT_FOUND" | "PREFERENCES_CONFLICT" | "PREFERENCES_INVALID" | "PREFERENCES_UNAVAILABLE";

export class ProjectPreferencesRepositoryError extends Error {
  constructor(
    public readonly code: ProjectPreferencesRepositoryErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ProjectPreferencesRepositoryError";
  }
}

export interface ProjectPreferencesRepository {
  getProjectPreferences(projectId: string): Promise<VersionedProjectPreferences>;
  updateProjectPreferences(
    projectId: string,
    expectedVersion: number | null,
    input: ProjectPreferencesInput,
  ): Promise<VersionedProjectPreferences>;
}

export function defaultProjectPreferences(): VersionedProjectPreferences {
  return {
    preferences: {
      visibleColumns: [...DEFAULT_VISIBLE_COLUMNS],
      analyticDimensions: [],
    },
    version: null,
    exists: false,
  };
}
