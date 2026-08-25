import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authenticatedServerFunctionMiddleware } from "../auth/auth-middleware";
import { createSupabasePreferenceStore } from "./supabase-preference-store";

const projectIdSchema = z.string().uuid();
const versionSchema = z.number().int().positive().safe().nullable();
const uniqueStringArray = z
  .array(z.string().min(1).max(512))
  .max(261)
  .refine((values) => new Set(values).size === values.length);
const getSchema = z.object({ projectId: projectIdSchema }).strict();
const updateSchema = z
  .object({
    projectId: projectIdSchema,
    expectedVersion: versionSchema,
    visibleColumns: uniqueStringArray,
    analyticDimensions: uniqueStringArray.max(3),
  })
  .strict();

export const getRemoteProjectPreferences = createServerFn({ method: "GET" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(getSchema)
  .handler(({ data, context }) =>
    createSupabasePreferenceStore().get(data.projectId, context.user.id),
  );

export const updateRemoteProjectPreferences = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(updateSchema)
  .handler(({ data, context }) =>
    createSupabasePreferenceStore().update(data.projectId, context.user.id, data.expectedVersion, {
      visibleColumns: data.visibleColumns,
      analyticDimensions: data.analyticDimensions,
    }),
  );
