import { z } from "zod";
import { parseCalendarDate } from "../calendar-date";

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });
const nullableTimestampSchema = timestampSchema.nullable();
const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => parseCalendarDate(value) === value, "Invalid date-only value");
const moneySchema = z.string().regex(/^(?:0\.(?:0[1-9]|[1-9]\d)|[1-9]\d{0,15}\.\d{2})$/);
const jsonScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const additionalDataSchema = z.record(z.string(), jsonScalarSchema);

export const accountExportV1Schema = z
  .object({
    account: z
      .object({
        id: uuidSchema,
        email: z.string().email().nullable(),
        emailConfirmedAt: nullableTimestampSchema,
        createdAt: timestampSchema,
        updatedAt: timestampSchema,
        profile: z
          .object({
            displayName: z.string().nullable(),
            locale: z.string().min(2).max(35),
            createdAt: timestampSchema,
            updatedAt: timestampSchema,
          })
          .strict()
          .nullable(),
      })
      .strict(),
    projects: z.array(
      z
        .object({
          id: uuidSchema,
          ownerUserId: uuidSchema,
          name: z.string(),
          type: z.string().nullable(),
          description: z.string().nullable(),
          version: z.number().int().positive(),
          createdAt: timestampSchema,
          updatedAt: timestampSchema,
        })
        .strict(),
    ),
    transactions: z.array(
      z
        .object({
          id: uuidSchema,
          projectId: uuidSchema,
          ownerUserId: uuidSchema,
          date: dateOnlySchema,
          description: z.string(),
          category: z.string(),
          type: z.enum(["receita", "despesa"]),
          amount: moneySchema,
          origin: z.enum(["manual", "imported"]),
          manuallyModified: z.boolean(),
          additionalData: additionalDataSchema,
          importRunId: uuidSchema.nullable(),
          version: z.number().int().positive(),
          createdAt: timestampSchema,
          updatedAt: timestampSchema,
        })
        .strict(),
    ),
    importProfiles: z.array(
      z
        .object({
          projectId: uuidSchema,
          ownerUserId: uuidSchema,
          headers: z.array(z.string()),
          columns: z.array(z.json()),
          mapping: z.record(z.string(), z.json()),
          schemaVersion: z.number().int().positive(),
          createdAt: timestampSchema,
          updatedAt: timestampSchema,
        })
        .strict(),
    ),
    importRuns: z.array(
      z
        .object({
          id: uuidSchema,
          projectId: uuidSchema,
          ownerUserId: uuidSchema,
          operation: z.enum(["initial", "update"]),
          status: z.enum(["pending", "processing", "completed", "failed"]),
          originalFilename: z.string().nullable(),
          fileHash: z.string().nullable(),
          rowCount: z.number().int().nonnegative(),
          addedCount: z.number().int().nonnegative(),
          changedCount: z.number().int().nonnegative(),
          removedCount: z.number().int().nonnegative(),
          duplicateCount: z.number().int().nonnegative(),
          unchangedCount: z.number().int().nonnegative(),
          preservedManualCount: z.number().int().nonnegative(),
          manualOverwriteCount: z.number().int().nonnegative(),
          baseProjectVersion: z.number().int().positive().nullable(),
          resultProjectVersion: z.number().int().positive().nullable(),
          errorCode: z.string().nullable(),
          createdAt: timestampSchema,
          completedAt: nullableTimestampSchema,
        })
        .strict(),
    ),
    projectPreferences: z.array(
      z
        .object({
          projectId: uuidSchema,
          userId: uuidSchema,
          visibleColumns: z.array(z.string()),
          analyticalDimensions: z.array(z.string()).max(3),
          version: z.number().int().positive(),
          createdAt: timestampSchema,
          updatedAt: timestampSchema,
        })
        .strict(),
    ),
  })
  .strict();

export type AccountExportV1 = z.infer<typeof accountExportV1Schema>;
