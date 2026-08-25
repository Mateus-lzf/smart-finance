import type { VersionedProjectPreferences } from "./project-preferences-repository";

export type PreferenceFunctionErrorCode =
  "project_not_found" | "conflict" | "invalid" | "unavailable";

export type PreferenceFunctionResult =
  | { ok: true; data: VersionedProjectPreferences }
  | { ok: false; code: PreferenceFunctionErrorCode };
