import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authenticatedServerFunctionMiddleware } from "../auth/auth-middleware";
import { parseCalendarDate } from "../calendar-date";
import type { ImportedValue } from "../finance-types";
import { createSupabaseTransactionStore } from "./supabase-transaction-store";
import { isSafeFinancialAmount } from "./transaction-mapper";
import type { TransactionCreateInput, TransactionUpdateInput } from "./transaction-repository";

const uuidSchema = z.string().uuid();
const versionSchema = z.number().int().positive().safe();
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => parseCalendarDate(value) === value);
const amountSchema = z.number().refine(isSafeFinancialAmount);
const additionalValueSchema = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);
const additionalDataSchema = z.record(z.string(), additionalValueSchema);
const transactionFields = {
  date: dateSchema,
  description: z.string().trim().min(1).max(500),
  category: z.string().trim().min(1).max(160),
  type: z.enum(["receita", "despesa"]),
  amount: amountSchema,
  additionalData: additionalDataSchema.optional(),
};
const createInputSchema = z
  .object({ ...transactionFields, origin: z.enum(["manual", "imported"]) })
  .strict();
const updateInputSchema = z
  .object({
    date: transactionFields.date.optional(),
    description: transactionFields.description.optional(),
    category: transactionFields.category.optional(),
    type: transactionFields.type.optional(),
    amount: transactionFields.amount.optional(),
    additionalData: transactionFields.additionalData,
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0);
const projectSchema = z.object({ projectId: uuidSchema }).strict();
const transactionSchema = z.object({ projectId: uuidSchema, transactionId: uuidSchema }).strict();
const createSchema = z.object({ projectId: uuidSchema, input: createInputSchema }).strict();
const updateSchema = z
  .object({
    projectId: uuidSchema,
    transactionId: uuidSchema,
    expectedVersion: versionSchema,
    input: updateInputSchema,
  })
  .strict();
const deleteSchema = z
  .object({ projectId: uuidSchema, transactionId: uuidSchema, expectedVersion: versionSchema })
  .strict();

function toCreateInput(data: z.infer<typeof createInputSchema>): TransactionCreateInput {
  return {
    date: data.date,
    description: data.description,
    category: data.category,
    type: data.type,
    amount: data.amount,
    origin: data.origin,
    ...(data.additionalData !== undefined
      ? { additionalData: data.additionalData as Record<string, ImportedValue> }
      : {}),
  };
}

function toUpdateInput(data: z.infer<typeof updateInputSchema>): TransactionUpdateInput {
  return {
    ...(data.date !== undefined ? { date: data.date } : {}),
    ...(data.description !== undefined ? { description: data.description } : {}),
    ...(data.category !== undefined ? { category: data.category } : {}),
    ...(data.type !== undefined ? { type: data.type } : {}),
    ...(data.amount !== undefined ? { amount: data.amount } : {}),
    ...(data.additionalData !== undefined
      ? { additionalData: data.additionalData as Record<string, ImportedValue> }
      : {}),
  };
}

export const listRemoteTransactions = createServerFn({ method: "GET" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(projectSchema)
  .handler(async ({ data, context }) =>
    createSupabaseTransactionStore().list(data.projectId, context.user.id),
  );

export const getRemoteTransaction = createServerFn({ method: "GET" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(transactionSchema)
  .handler(async ({ data, context }) =>
    createSupabaseTransactionStore().get(data.projectId, data.transactionId, context.user.id),
  );

export const createRemoteTransaction = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(createSchema)
  .handler(async ({ data, context }) =>
    createSupabaseTransactionStore().create(
      data.projectId,
      context.user.id,
      toCreateInput(data.input),
    ),
  );

export const updateRemoteTransaction = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(updateSchema)
  .handler(async ({ data, context }) =>
    createSupabaseTransactionStore().update(
      data.projectId,
      data.transactionId,
      context.user.id,
      data.expectedVersion,
      toUpdateInput(data.input),
    ),
  );

export const deleteRemoteTransaction = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(deleteSchema)
  .handler(async ({ data, context }) =>
    createSupabaseTransactionStore().delete(
      data.projectId,
      data.transactionId,
      context.user.id,
      data.expectedVersion,
    ),
  );
