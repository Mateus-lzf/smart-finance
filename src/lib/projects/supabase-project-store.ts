import { createServerOnlyFn } from "@tanstack/react-start";
import type { ProjectInput } from "../finance-types";
import { createSupabaseServerClient } from "../supabase/server-client";
import { mapProjectRow, projectInputToPersistence } from "./project-mapper";
import type {
  DeleteProjectResult,
  GetProjectResult,
  ListProjectsResult,
  MutateProjectResult,
  ProjectFunctionErrorCode,
} from "./project-function-types";

const PROJECT_COLUMNS = "id,name,type,description,version,created_at,updated_at,owner_user_id";

async function classifyMissingMutation(
  projectId: string,
  ownerUserId: string,
  expectedVersion: number,
): Promise<ProjectFunctionErrorCode> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .select("version")
    .eq("id", projectId)
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();
  if (error) return "unavailable";
  if (!data) return "not_found";
  return data.version !== expectedVersion ? "conflict" : "unavailable";
}

export const createSupabaseProjectStore = createServerOnlyFn(() => ({
  async list(ownerUserId: string): Promise<ListProjectsResult> {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("projects")
      .select(PROJECT_COLUMNS)
      .eq("owner_user_id", ownerUserId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (error) return { ok: false, code: "unavailable" };
    return { ok: true, data: data.map(mapProjectRow) };
  },

  async get(projectId: string, ownerUserId: string): Promise<GetProjectResult> {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("projects")
      .select(PROJECT_COLUMNS)
      .eq("id", projectId)
      .eq("owner_user_id", ownerUserId)
      .maybeSingle();
    if (error) return { ok: false, code: "unavailable" };
    return { ok: true, data: data ? mapProjectRow(data) : null };
  },

  async create(ownerUserId: string, input: ProjectInput): Promise<MutateProjectResult> {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("projects")
      .insert({ ...projectInputToPersistence(input), owner_user_id: ownerUserId })
      .select(PROJECT_COLUMNS)
      .single();
    if (error || !data) return { ok: false, code: "unavailable" };
    return { ok: true, data: mapProjectRow(data) };
  },

  async update(
    projectId: string,
    ownerUserId: string,
    expectedVersion: number,
    input: ProjectInput,
  ): Promise<MutateProjectResult> {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("projects")
      .update({ ...projectInputToPersistence(input), version: expectedVersion + 1 })
      .eq("id", projectId)
      .eq("owner_user_id", ownerUserId)
      .eq("version", expectedVersion)
      .select(PROJECT_COLUMNS)
      .maybeSingle();
    if (error) return { ok: false, code: "unavailable" };
    if (data) return { ok: true, data: mapProjectRow(data) };
    return {
      ok: false,
      code: await classifyMissingMutation(projectId, ownerUserId, expectedVersion),
    };
  },

  async delete(
    projectId: string,
    ownerUserId: string,
    expectedVersion: number,
  ): Promise<DeleteProjectResult> {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("projects")
      .delete()
      .eq("id", projectId)
      .eq("owner_user_id", ownerUserId)
      .eq("version", expectedVersion)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, code: "unavailable" };
    if (data) return { ok: true, data: null };
    return {
      ok: false,
      code: await classifyMissingMutation(projectId, ownerUserId, expectedVersion),
    };
  },
}));
