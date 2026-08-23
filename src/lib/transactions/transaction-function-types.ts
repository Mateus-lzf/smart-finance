import type { VersionedTransaction } from "./transaction-repository";

export type TransactionFunctionErrorCode =
  "project_not_found" | "transaction_not_found" | "conflict" | "unavailable";

export type TransactionFunctionResult<T> =
  { ok: true; data: T } | { ok: false; code: TransactionFunctionErrorCode };

export type ListTransactionsResult = TransactionFunctionResult<VersionedTransaction[]>;
export type GetTransactionResult = TransactionFunctionResult<VersionedTransaction | null>;
export type MutateTransactionResult = TransactionFunctionResult<VersionedTransaction>;
export type DeleteTransactionResult = TransactionFunctionResult<null>;
