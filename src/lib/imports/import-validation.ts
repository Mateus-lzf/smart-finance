import { z } from "zod";
import { parseCalendarDate } from "../calendar-date";
import { importFields } from "../import-service";
import { isSafeFinancialAmount } from "../transactions/transaction-mapper";
import {
  REMOTE_IMPORT_MAX_ADDITIONAL_BYTES,
  REMOTE_IMPORT_MAX_ADDITIONAL_FIELDS,
  REMOTE_IMPORT_MAX_COLUMNS,
  REMOTE_IMPORT_MAX_PAYLOAD_BYTES,
  REMOTE_IMPORT_MAX_ROWS,
} from "./import-repository";

const textEncoder = new TextEncoder();
const additionalValue = z.union([
  z.string().max(4_000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
const additionalData = z
  .record(z.string().min(1).max(200), additionalValue)
  .refine((value) => Object.keys(value).length <= REMOTE_IMPORT_MAX_ADDITIONAL_FIELDS)
  .refine(
    (value) =>
      textEncoder.encode(JSON.stringify(value)).byteLength <= REMOTE_IMPORT_MAX_ADDITIONAL_BYTES,
  );
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => parseCalendarDate(value) === value);

export const remoteImportRowSchema = z
  .object({
    date,
    description: z.string().trim().min(1).max(500),
    category: z.string().trim().min(1).max(160),
    type: z.enum(["receita", "despesa"]),
    amount: z.number().refine(isSafeFinancialAmount),
    additionalData: additionalData.optional(),
  })
  .strict();

const column = z
  .object({
    id: z.string().min(1).max(200),
    header: z.string().min(1).max(255),
    index: z.number().int().nonnegative(),
  })
  .strict();
const mapping = z
  .object({
    date: z.string(),
    description: z.string(),
    category: z.string(),
    type: z.string(),
    amount: z.string(),
  })
  .strict();
export const remoteImportProfileSchema = z
  .object({
    headers: z.array(z.string().max(255)).min(1).max(REMOTE_IMPORT_MAX_COLUMNS),
    columns: z.array(column).min(1).max(REMOTE_IMPORT_MAX_COLUMNS),
    mapping,
  })
  .strict()
  .superRefine((profile, context) => {
    const ids = new Set(profile.columns.map(({ id }) => id));
    const indexes = new Set(profile.columns.map(({ index }) => index));
    if (ids.size !== profile.columns.length || indexes.size !== profile.columns.length) {
      context.addIssue({ code: "custom", message: "As colunas do perfil devem ser únicas." });
    }
    if (profile.headers.length !== profile.columns.length) {
      context.addIssue({
        code: "custom",
        message: "Cabeçalhos e colunas devem possuir o mesmo tamanho.",
      });
    }
    for (const current of profile.columns) {
      if (profile.headers[current.index] !== current.header) {
        context.addIssue({
          code: "custom",
          message: "Cabeçalhos e índices do perfil não correspondem.",
        });
      }
    }
    for (const { key } of importFields) {
      if (!ids.has(profile.mapping[key])) {
        context.addIssue({
          code: "custom",
          message: `O mapeamento de ${key} não pertence ao perfil.`,
        });
      }
    }
  });

const file = z
  .object({
    originalFilename: z.string().trim().min(1).max(255),
    fileHash: z.string().regex(/^[a-f0-9]{64}$/i),
  })
  .strict();
const rows = z.array(remoteImportRowSchema).min(1).max(REMOTE_IMPORT_MAX_ROWS);
const common = {
  idempotencyKey: z.string().uuid(),
  file,
  profile: remoteImportProfileSchema,
  rows,
  confirmPossibleDuplicates: z.boolean(),
};

export const initialRemoteImportSchema = z
  .object({
    ...common,
    project: z
      .object({
        name: z.string().trim().min(1).max(160),
        type: z.string().trim().min(1).max(120).optional(),
        description: z.string().trim().min(1).max(2_000).optional(),
      })
      .strict(),
  })
  .strict();

export const updateRemoteImportSchema = z
  .object({
    ...common,
    projectId: z.string().uuid(),
    baseProjectVersion: z.number().int().positive().safe(),
    confirmManualOverwrite: z.boolean(),
  })
  .strict();

export const prepareRemoteImportSchema = z.object({ projectId: z.string().uuid(), rows }).strict();

export function validateImportPayloadSize(value: unknown) {
  return textEncoder.encode(JSON.stringify(value)).byteLength <= REMOTE_IMPORT_MAX_PAYLOAD_BYTES;
}

export function validateProfileRows(
  profile: z.infer<typeof remoteImportProfileSchema>,
  rows: z.infer<typeof remoteImportRowSchema>[],
) {
  const columns = new Set(profile.columns.map(({ id }) => id));
  const normalized = new Set(Object.values(profile.mapping));
  for (const row of rows) {
    for (const key of Object.keys(row.additionalData ?? {})) {
      if (!columns.has(key) || normalized.has(key)) {
        throw new Error("IMPORT_PROFILE_MISMATCH");
      }
    }
  }
}
