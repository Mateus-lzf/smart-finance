import { z } from "zod";
import type { Database } from "../supabase/database.types";
import { mapImportProfileRow } from "../imports/import-profile-mapper";
import { mapProjectRow } from "../projects/project-mapper";
import {
  defaultProjectPreferences,
  type VersionedProjectPreferences,
} from "../preferences/project-preferences-repository";
import { mapProjectPreferencesRow } from "../preferences/project-preferences-mapper";
import { mapTransactionRow } from "../transactions/transaction-mapper";
import type { RemoteFinancialWorkspaceSnapshot } from "./remote-workspace-types";

type Tables = Database["public"]["Tables"];
const rowArray = z.array(z.record(z.string(), z.unknown()));
const payloadSchema = z.object({
  projects: rowArray,
  transactions: rowArray,
  import_profiles: rowArray,
  project_preferences: rowArray,
});

function unique<T>(items: T[], key: (item: T) => string, label: string) {
  const seen = new Set<string>();
  for (const item of items) {
    const current = key(item);
    if (seen.has(current)) throw new Error(`Snapshot remoto contém ${label} duplicado.`);
    seen.add(current);
  }
}

export function mapRemoteWorkspaceSnapshot(value: unknown): RemoteFinancialWorkspaceSnapshot {
  const payload = payloadSchema.parse(value);
  const projectRows = payload.projects as unknown as Tables["projects"]["Row"][];
  const transactionRows = payload.transactions as unknown as Tables["transactions"]["Row"][];
  const profileRows = payload.import_profiles as unknown as Tables["import_profiles"]["Row"][];
  const preferenceRows =
    payload.project_preferences as unknown as Tables["project_preferences"]["Row"][];
  unique(projectRows, ({ id }) => id, "projeto");
  unique(transactionRows, ({ id }) => id, "lançamento");
  unique(profileRows, ({ project_id }) => project_id, "perfil");
  unique(preferenceRows, ({ project_id }) => project_id, "preferência");

  const projects = projectRows.map(mapProjectRow);
  const projectIds = new Set(projectRows.map(({ id }) => id));
  const transactionsByProject: RemoteFinancialWorkspaceSnapshot["transactionsByProject"] = {};
  const importProfilesByProject: RemoteFinancialWorkspaceSnapshot["importProfilesByProject"] = {};
  const preferencesByProject: Record<string, VersionedProjectPreferences> = {};
  for (const { id } of projectRows) {
    transactionsByProject[id] = [];
    preferencesByProject[id] = defaultProjectPreferences();
  }
  for (const row of transactionRows) {
    if (!projectIds.has(row.project_id))
      throw new Error("Lançamento sem projeto no snapshot remoto.");
    transactionsByProject[row.project_id]!.push(mapTransactionRow(row));
  }
  for (const row of profileRows) {
    if (!projectIds.has(row.project_id)) throw new Error("Perfil sem projeto no snapshot remoto.");
    importProfilesByProject[row.project_id] = mapImportProfileRow(row);
  }
  for (const row of preferenceRows) {
    if (!projectIds.has(row.project_id))
      throw new Error("Preferência sem projeto no snapshot remoto.");
    preferencesByProject[row.project_id] = mapProjectPreferencesRow(row);
  }
  return { projects, transactionsByProject, importProfilesByProject, preferencesByProject };
}
