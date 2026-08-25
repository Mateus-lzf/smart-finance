import type { ImportProfile } from "../finance-types";
import type { Database } from "../supabase/database.types";
import { remoteImportProfileSchema } from "./import-validation";

export const SUPPORTED_IMPORT_PROFILE_SCHEMA_VERSION = 1;

export class UnsupportedImportProfileVersionError extends Error {
  constructor(readonly version: number) {
    super(`Versão de perfil de importação não suportada: ${version}.`);
  }
}

export type ImportProfileRow = Database["public"]["Tables"]["import_profiles"]["Row"];

export function mapImportProfileRow(row: ImportProfileRow): ImportProfile {
  if (row.schema_version !== SUPPORTED_IMPORT_PROFILE_SCHEMA_VERSION) {
    throw new UnsupportedImportProfileVersionError(row.schema_version);
  }
  const profile = remoteImportProfileSchema.parse({
    headers: row.headers,
    columns: row.columns,
    mapping: row.mapping,
  });
  return { headers: profile.headers, columns: profile.columns, mapping: profile.mapping };
}
