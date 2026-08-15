import { parseCalendarDate } from "./calendar-date";
import type { Transaction, TransactionInput } from "./finance-types";

export type TransactionValidationErrors = Partial<Record<keyof TransactionInput, string>>;

export function parseTransactionAmount(value: string) {
  let normalized = value.trim().replace(/[^\d,.-]/g, "");
  if (normalized.includes(",") && normalized.includes("."))
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  else if (normalized.includes(",")) normalized = normalized.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function validateTransactionInput(input: TransactionInput) {
  const errors: TransactionValidationErrors = {};
  const date = parseCalendarDate(input.date);
  const description = input.description.trim();
  const category = input.category.trim();
  const amount = parseTransactionAmount(input.amount);
  if (!date) errors.date = "Informe uma data válida.";
  if (!description) errors.description = "Informe uma descrição.";
  if (!category) errors.category = "Informe uma categoria.";
  if (input.type !== "receita" && input.type !== "despesa")
    errors.type = "Selecione Receita ou Despesa.";
  if (amount === null) errors.amount = "Informe um valor maior que zero.";
  if (Object.keys(errors).length) return { ok: false as const, errors };
  return {
    ok: true as const,
    value: { date: date!, description, category, type: input.type, amount: amount! },
  };
}

function uniqueTransactionId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export function createManualTransaction(input: TransactionInput, id = uniqueTransactionId()) {
  const validation = validateTransactionInput(input);
  if (!validation.ok) return validation;
  return {
    ok: true as const,
    value: { id, ...validation.value, origin: "manual" as const } satisfies Transaction,
  };
}

export function editableTransactionPatch(input: TransactionInput) {
  return validateTransactionInput(input);
}

export function addLocalTransaction(rows: Transaction[], row: Transaction) {
  return [row, ...rows];
}

export function updateLocalTransaction(
  rows: Transaction[],
  id: string,
  patch: Partial<Transaction>,
) {
  return rows.map((row) =>
    row.id === id
      ? {
          ...row,
          ...patch,
          ...(row.origin === "manual" ? {} : { manuallyModified: true }),
        }
      : row,
  );
}

export function deleteLocalTransaction(rows: Transaction[], id: string) {
  return rows.filter((row) => row.id !== id);
}
