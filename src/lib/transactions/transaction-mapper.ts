import { parseCalendarDate } from "../calendar-date";
import type { ImportedValue, TransactionType } from "../finance-types";
import type { Database, Json } from "../supabase/database.types";
import type {
  TransactionCreateInput,
  TransactionOrigin,
  TransactionUpdateInput,
  VersionedTransaction,
} from "./transaction-repository";

export type TransactionRow = Database["public"]["Tables"]["transactions"]["Row"];

const transactionTypes = new Set<TransactionType>(["receita", "despesa"]);
const transactionOrigins = new Set<TransactionOrigin>(["manual", "imported"]);

export function isSafeFinancialAmount(value: number) {
  if (!Number.isFinite(value) || value <= 0) return false;
  const cents = Math.round(value * 100);
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(value)) * 2;
  return Number.isSafeInteger(cents) && Math.abs(value - cents / 100) <= tolerance;
}

function mapAdditionalData(value: Json): Record<string, ImportedValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Os dados adicionais remotos não possuem o formato esperado.");
  }
  const result: Record<string, ImportedValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      item !== null &&
      typeof item !== "string" &&
      typeof item !== "number" &&
      typeof item !== "boolean"
    ) {
      throw new Error("Os dados adicionais remotos possuem um valor não suportado.");
    }
    result[key] = item;
  }
  return result;
}

export function mapTransactionRow(row: TransactionRow): VersionedTransaction {
  const date = parseCalendarDate(row.date);
  if (date !== row.date)
    throw new Error("A data remota não possui o formato de calendário esperado.");
  if (!transactionTypes.has(row.type as TransactionType)) {
    throw new Error("O tipo remoto da transação não é suportado.");
  }
  if (!transactionOrigins.has(row.origin as TransactionOrigin)) {
    throw new Error("A origem remota da transação não é suportada.");
  }
  if (!isSafeFinancialAmount(row.amount)) {
    throw new Error("O valor remoto da transação não pode ser representado com segurança.");
  }
  const additionalData = mapAdditionalData(row.additional_data);
  return {
    transaction: {
      id: row.id,
      date,
      description: row.description,
      category: row.category,
      type: row.type as TransactionType,
      amount: row.amount,
      origin: row.origin as TransactionOrigin,
      manuallyModified: row.manually_modified,
      ...(Object.keys(additionalData).length > 0 ? { additionalData } : {}),
    },
    projectId: row.project_id,
    importRunId: row.import_run_id,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function transactionCreateInputToPersistence(input: TransactionCreateInput) {
  return {
    date: input.date,
    description: input.description.trim(),
    category: input.category.trim(),
    type: input.type,
    amount: input.amount,
    origin: input.origin,
    manually_modified: false,
    additional_data: (input.additionalData ?? {}) as Json,
  };
}

export function transactionUpdateInputToPersistence(
  input: TransactionUpdateInput,
  manuallyModified: boolean,
) {
  return {
    ...(input.date !== undefined ? { date: input.date } : {}),
    ...(input.description !== undefined ? { description: input.description.trim() } : {}),
    ...(input.category !== undefined ? { category: input.category.trim() } : {}),
    ...(input.type !== undefined ? { type: input.type } : {}),
    ...(input.amount !== undefined ? { amount: input.amount } : {}),
    ...(input.additionalData !== undefined
      ? { additional_data: input.additionalData as Json }
      : {}),
    ...(manuallyModified ? { manually_modified: true } : {}),
  };
}
