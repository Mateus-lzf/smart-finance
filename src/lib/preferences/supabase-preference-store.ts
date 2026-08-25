import { createServerOnlyFn } from "@tanstack/react-start";
import type { Json } from "../supabase/database.types";
import { createSupabaseServerClient } from "../supabase/server-client";
import type { PreferenceFunctionResult } from "./preference-function-types";
import { mapProjectPreferencesRow } from "./project-preferences-mapper";
import type { ProjectPreferencesInput } from "./project-preferences-repository";

function mutationError(message = ""): "project_not_found" | "conflict" | "invalid" | "unavailable" {
  if (message.includes("project_not_found")) return "project_not_found";
  if (message.includes("preferences_conflict")) return "conflict";
  if (message.includes("preferences_invalid")) return "invalid";
  return "unavailable";
}

export const createSupabasePreferenceStore = createServerOnlyFn(() => ({
  async get(projectId: string, ownerUserId: string): Promise<PreferenceFunctionResult> {
    const supabase = createSupabaseServerClient();
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("owner_user_id", ownerUserId)
      .maybeSingle();
    if (projectError) return { ok: false, code: "unavailable" };
    if (!project) return { ok: false, code: "project_not_found" };

    const { data, error } = await supabase
      .from("project_preferences")
      .select(
        "project_id,user_id,visible_columns,analytical_dimensions,version,created_at,updated_at",
      )
      .eq("project_id", projectId)
      .eq("user_id", ownerUserId)
      .maybeSingle();
    if (error) return { ok: false, code: "unavailable" };
    try {
      return { ok: true, data: mapProjectPreferencesRow(data) };
    } catch {
      return { ok: false, code: "unavailable" };
    }
  },

  async update(
    projectId: string,
    _ownerUserId: string,
    expectedVersion: number | null,
    input: ProjectPreferencesInput,
  ): Promise<PreferenceFunctionResult> {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .rpc("update_project_preferences", {
        p_project_id: projectId,
        // PostgreSQL accepts NULL for the first insert; generated RPC argument
        // types do not encode nullable function parameters.
        p_expected_version: expectedVersion as number,
        p_visible_columns: input.visibleColumns as Json,
        p_analytical_dimensions: input.analyticDimensions as Json,
      })
      .single();
    if (error || !data) return { ok: false, code: mutationError(error?.message) };
    try {
      return { ok: true, data: mapProjectPreferencesRow(data) };
    } catch {
      return { ok: false, code: "unavailable" };
    }
  },
}));
