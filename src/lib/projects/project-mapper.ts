import type { Database } from "../supabase/database.types";
import type { ProjectInput } from "../finance-types";
import type { VersionedProject } from "./project-repository";

export type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];

export function mapProjectRow(row: ProjectRow): VersionedProject {
  return {
    project: {
      id: row.id,
      name: row.name,
      ...(row.type ? { type: row.type } : {}),
      ...(row.description ? { description: row.description } : {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    version: row.version,
  };
}

export function projectInputToPersistence(input: ProjectInput) {
  return {
    name: input.name.trim(),
    type: input.type?.trim() || null,
    description: input.description?.trim() || null,
  };
}
