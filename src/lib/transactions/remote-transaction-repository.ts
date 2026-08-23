import type {
  DeleteTransactionResult,
  GetTransactionResult,
  ListTransactionsResult,
  MutateTransactionResult,
} from "./transaction-function-types";
import {
  createRemoteTransaction,
  deleteRemoteTransaction,
  getRemoteTransaction,
  listRemoteTransactions,
  updateRemoteTransaction,
} from "./transaction-functions";
import {
  TransactionRepositoryError,
  type TransactionCreateInput,
  type TransactionRepository,
  type TransactionRepositoryErrorCode,
  type TransactionUpdateInput,
} from "./transaction-repository";

export type RemoteTransactionGateway = {
  list(data: { projectId: string }): Promise<ListTransactionsResult>;
  get(data: { projectId: string; transactionId: string }): Promise<GetTransactionResult>;
  create(data: {
    projectId: string;
    input: TransactionCreateInput;
  }): Promise<MutateTransactionResult>;
  update(data: {
    projectId: string;
    transactionId: string;
    expectedVersion: number;
    input: TransactionUpdateInput;
  }): Promise<MutateTransactionResult>;
  delete(data: {
    projectId: string;
    transactionId: string;
    expectedVersion: number;
  }): Promise<DeleteTransactionResult>;
};

const defaultGateway: RemoteTransactionGateway = {
  list: (data) => listRemoteTransactions({ data }),
  get: (data) => getRemoteTransaction({ data }),
  create: (data) => createRemoteTransaction({ data }),
  update: (data) => updateRemoteTransaction({ data }),
  delete: (data) => deleteRemoteTransaction({ data }),
};

const errorCodes: Record<
  "project_not_found" | "transaction_not_found" | "conflict" | "unavailable",
  TransactionRepositoryErrorCode
> = {
  project_not_found: "PROJECT_NOT_FOUND",
  transaction_not_found: "TRANSACTION_NOT_FOUND",
  conflict: "TRANSACTION_CONFLICT",
  unavailable: "TRANSACTION_UNAVAILABLE",
};

function unwrap<T>(result: { ok: true; data: T } | { ok: false; code: keyof typeof errorCodes }) {
  if (result.ok) return result.data;
  const code = errorCodes[result.code];
  const message =
    code === "TRANSACTION_CONFLICT"
      ? "O lançamento foi alterado em outra sessão. Recarregue os dados antes de tentar novamente."
      : code === "PROJECT_NOT_FOUND"
        ? "O projeto não está disponível."
        : code === "TRANSACTION_NOT_FOUND"
          ? "O lançamento não está disponível."
          : "Não foi possível acessar os lançamentos agora.";
  throw new TransactionRepositoryError(code, message);
}

export class RemoteTransactionRepository implements TransactionRepository {
  constructor(private readonly gateway: RemoteTransactionGateway = defaultGateway) {}

  async listTransactions(projectId: string) {
    return unwrap(await this.gateway.list({ projectId }));
  }

  async getTransaction(projectId: string, transactionId: string) {
    return unwrap(await this.gateway.get({ projectId, transactionId }));
  }

  async createTransaction(projectId: string, input: TransactionCreateInput) {
    return unwrap(await this.gateway.create({ projectId, input }));
  }

  async updateTransaction(
    projectId: string,
    transactionId: string,
    expectedVersion: number,
    input: TransactionUpdateInput,
  ) {
    return unwrap(await this.gateway.update({ projectId, transactionId, expectedVersion, input }));
  }

  async deleteTransaction(projectId: string, transactionId: string, expectedVersion: number) {
    unwrap(await this.gateway.delete({ projectId, transactionId, expectedVersion }));
  }
}
