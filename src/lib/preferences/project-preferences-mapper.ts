import type { Database } from "../supabase/database.types";
import {
  defaultProjectPreferences,
  type VersionedProjectPreferences,
} from "./project-preferences-repository";

export type ProjectPreferencesRow = Database["public"]["Tables"]["project_preferences"]["Row"];

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`A prefer�ncia remota ${field} n�o possui o formato esperado.`);
  }
  return [...value];
}

export function mapProjectPreferencesRow(
  row: ProjectPreferencesRow | null,
): VersionedProjectPreferences {
  if (!row) return defaultProjectPreferences();
  if (!Number.isSafeInteger(row.version) || row.version < 1) {
    throw new Error("A vers�o das prefer�ncias remotas n�o � v�lida.");
  }
  const analyticDimensions = stringArray(row.analytical_dimensions, "de dimens�es");
  if (analyticDimensions.length > 3) {
    throw new Error("As prefer�ncias remotas possuem dimens�es demais.");
  }
  return {
    preferences: {
      visibleColumns: stringArray(row.visible_columns, "de colunas"),
      analyticDimensions,
    },
    version: row.version,
    exists: true,
  };
}
