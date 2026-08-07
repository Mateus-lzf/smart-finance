import type { Transaction } from "./finance-types";

export function addLocalTransaction(rows: Transaction[], row: Transaction) {
  return [row, ...rows];
}

export function updateLocalTransaction(
  rows: Transaction[],
  id: string,
  patch: Partial<Transaction>,
) {
  return rows.map((row) => (row.id === id ? { ...row, ...patch } : row));
}

export function deleteLocalTransaction(rows: Transaction[], id: string) {
  return rows.filter((row) => row.id !== id);
}
