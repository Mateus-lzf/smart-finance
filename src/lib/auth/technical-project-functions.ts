import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseServerClient } from "../supabase/server-client";
import { authenticatedServerFunctionMiddleware } from "./auth-middleware";

const technicalProjectInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
});

const projectIdSchema = z.object({ id: z.string().uuid() });

const updateTechnicalProjectSchema = projectIdSchema.extend({
  name: z.string().trim().min(1).max(160),
});

export const createTechnicalProject = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(technicalProjectInputSchema)
  .handler(async ({ data, context }) => {
    const supabase = createSupabaseServerClient();
    const { data: project, error } = await supabase
      .from("projects")
      .insert({ name: data.name, owner_user_id: context.user.id })
      .select("id,name,owner_user_id")
      .single();
    if (error) throw new Error("Não foi possível criar o projeto técnico.");
    return project;
  });

export const listTechnicalProjects = createServerFn({ method: "GET" })
  .middleware([authenticatedServerFunctionMiddleware])
  .handler(async () => {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("projects")
      .select("id,name,owner_user_id")
      .order("created_at", { ascending: true });
    if (error) throw new Error("Não foi possível listar os projetos técnicos.");
    return data;
  });

export const getTechnicalProject = createServerFn({ method: "GET" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(projectIdSchema)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: project, error } = await supabase
      .from("projects")
      .select("id,name,owner_user_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error("Não foi possível consultar o projeto técnico.");
    return project;
  });

export const updateTechnicalProject = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(updateTechnicalProjectSchema)
  .handler(async ({ data }) => {
    const supabase = createSupabaseServerClient();
    const { data: project, error } = await supabase
      .from("projects")
      .update({ name: data.name })
      .eq("id", data.id)
      .select("id,name,owner_user_id")
      .maybeSingle();
    if (error) throw new Error("Não foi possível alterar o projeto técnico.");
    return project;
  });
