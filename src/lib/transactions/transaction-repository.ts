import type { ImportedValue, Transaction, TransactionType } from "../finance-types";

export type TransactionOrigin = "manual" | "imported";

export type TransactionCreateInput = {
  date: string;
  description: string;
  category: string;
  type: TransactionType;
  amount: number;
  origin: TransactionOrigin;
  additionalData?: Record<string, ImportedValue>;
};

export type TransactionUpdateInput = Partial<
  Pick<
    TransactionCreateInput,
    "date" | "description" | "category" | "type" | "amount" | "additionalData"
  >
>;

export type VersionedTransaction = {
  transaction: Transaction;
  projectId: string;
  importRunId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type TransactionRepositoryErrorCode =
  | "PROJECT_NOT_FOUND"
  | "TRANSACTION_NOT_FOUND"
  | "TRANSACTION_CONFLICT"
  | "TRANSACTION_UNAVAILABLE";

export class TransactionRepositoryError extends Error {
  constructor(
    public readonly code: TransactionRepositoryErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "TransactionRepositoryError";
  }
}

export interface TransactionRepository {
  listTransactions(projectId: string): Promise<VersionedTransaction[]>;
  getTransaction(projectId: string, transactionId: string): Promise<VersionedTransaction | null>;
  createTransaction(
    projectId: string,
    input: TransactionCreateInput,
  ): Promise<VersionedTransaction>;
  updateTransaction(
    projectId: string,
    transactionId: string,
    expectedVersion: number,
    input: TransactionUpdateInput,
  ): Promise<VersionedTransaction>;
  deleteTransaction(
    projectId: string,
    transactionId: string,
    expectedVersion: number,
  ): Promise<void>;
}
