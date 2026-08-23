import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authenticatedServerFunctionMiddleware } from "../auth/auth-middleware";
import type { ProjectInput } from "../finance-types";
import { createSupabaseProjectStore } from "./supabase-project-store";

const optionalTrimmedText = (max: number) => z.string().trim().max(max).optional();
const projectInputSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    type: optionalTrimmedText(120),
    description: optionalTrimmedText(2000),
  })
  .strict();
const projectIdSchema = z.string().uuid();
const versionSchema = z.number().int().positive().safe();

const getProjectSchema = z.object({ id: projectIdSchema }).strict();
const updateProjectSchema = z
  .object({ id: projectIdSchema, expectedVersion: versionSchema, input: projectInputSchema })
  .strict();
const deleteProjectSchema = z
  .object({ id: projectIdSchema, expectedVersion: versionSchema })
  .strict();

function toProjectInput(data: z.infer<typeof projectInputSchema>): ProjectInput {
  return {
    name: data.name,
    ...(data.type !== undefined ? { type: data.type } : {}),
    ...(data.description !== undefined ? { description: data.description } : {}),
  };
}

export const listRemoteProjects = createServerFn({ method: "GET" })
  .middleware([authenticatedServerFunctionMiddleware])
  .handler(async ({ context }) => createSupabaseProjectStore().list(context.user.id));

export const getRemoteProject = createServerFn({ method: "GET" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(getProjectSchema)
  .handler(async ({ data, context }) => createSupabaseProjectStore().get(data.id, context.user.id));

export const createRemoteProject = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(projectInputSchema)
  .handler(async ({ data, context }) =>
    createSupabaseProjectStore().create(context.user.id, toProjectInput(data)),
  );

export const updateRemoteProject = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(updateProjectSchema)
  .handler(async ({ data, context }) =>
    createSupabaseProjectStore().update(
      data.id,
      context.user.id,
      data.expectedVersion,
      toProjectInput(data.input),
    ),
  );

export const deleteRemoteProject = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(deleteProjectSchema)
  .handler(async ({ data, context }) =>
    createSupabaseProjectStore().delete(data.id, context.user.id, data.expectedVersion),
  );
