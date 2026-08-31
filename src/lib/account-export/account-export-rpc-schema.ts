import { z } from "zod";

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });
const nullableTimestampSchema = timestampSchema.nullable();
const jsonScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const accountExportUserSchema = z
  .object({
    id: uuidSchema,
    email: z.string().email().nullable(),
    email_confirmed_at: nullableTimestampSchema,
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .strict();

export const accountExportRpcSnapshotSchema = z
  .object({
    profile: z
      .object({
        display_name: z.string().nullable(),
        locale: z.string().min(2).max(35),
        created_at: timestampSchema,
        updated_at: timestampSchema,
      })
      .strict()
      .nullable(),
    projects: z.array(
      z
        .object({
          id: uuidSchema,
          owner_user_id: uuidSchema,
          name: z.string(),
          type: z.string().nullable(),
          description: z.string().nullable(),
          version: z.number().int().positive(),
          created_at: timestampSchema,
          updated_at: timestampSchema,
        })
        .strict(),
    ),
    transactions: z.array(
      z
        .object({
          id: uuidSchema,
          project_id: uuidSchema,
          owner_user_id: uuidSchema,
          date: z.string(),
          description: z.string(),
          category: z.string(),
          type: z.string(),
          amount: z.string(),
          origin: z.string(),
          manually_modified: z.boolean(),
          additional_data: z.record(z.string(), jsonScalarSchema),
          import_run_id: uuidSchema.nullable(),
          version: z.number().int().positive(),
          created_at: timestampSchema,
          updated_at: timestampSchema,
        })
        .strict(),
    ),
    import_profiles: z.array(
      z
        .object({
          project_id: uuidSchema,
          owner_user_id: uuidSchema,
          headers: z.array(z.string()),
          columns: z.array(z.json()),
          mapping: z.record(z.string(), z.json()),
          schema_version: z.number().int().positive(),
          created_at: timestampSchema,
          updated_at: timestampSchema,
        })
        .strict(),
    ),
    import_runs: z.array(
      z
        .object({
          id: uuidSchema,
          project_id: uuidSchema,
          owner_user_id: uuidSchema,
          operation: z.string(),
          status: z.string(),
          original_filename: z.string().nullable(),
          file_hash: z.string().nullable(),
          row_count: z.number().int().nonnegative(),
          added_count: z.number().int().nonnegative(),
          changed_count: z.number().int().nonnegative(),
          removed_count: z.number().int().nonnegative(),
          duplicate_count: z.number().int().nonnegative(),
          unchanged_count: z.number().int().nonnegative(),
          preserved_manual_count: z.number().int().nonnegative(),
          manual_overwrite_count: z.number().int().nonnegative(),
          base_project_version: z.number().int().positive().nullable(),
          result_project_version: z.number().int().positive().nullable(),
          error_code: z.string().nullable(),
          created_at: timestampSchema,
          completed_at: nullableTimestampSchema,
        })
        .strict(),
    ),
    project_preferences: z.array(
      z
        .object({
          project_id: uuidSchema,
          user_id: uuidSchema,
          visible_columns: z.array(z.string()),
          analytical_dimensions: z.array(z.string()),
          version: z.number().int().positive(),
          created_at: timestampSchema,
          updated_at: timestampSchema,
        })
        .strict(),
    ),
  })
  .strict();

export type AccountExportUser = z.infer<typeof accountExportUserSchema>;
