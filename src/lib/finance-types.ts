export type TransactionType = "receita" | "despesa";

export type TransactionStatus = "Pago" | "Pendente" | "Atrasado";

export type Project = {
  id: string;
  name: string;
  type?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectInput = {
  name: string;
  type?: string;
  description?: string;
};

export type Transaction = {
  id: string;
  date: string;
  description: string;
  category: string;
  method: string;
  type: TransactionType;
  amount: number;
  status: TransactionStatus;
};

export type ImportField = "date" | "description" | "category" | "type" | "amount";

export type ColumnMapping = Record<ImportField, string>;

export type RawImportRow = Record<string, unknown>;

export type ImportPreview = {
  fileName: string;
  headers: string[];
  rows: RawImportRow[];
  mapping: ColumnMapping;
  missingFields: ImportField[];
};

export type ImportProfile = {
  headers: string[];
  mapping: ColumnMapping;
};

export type TransactionChange = {
  before: Transaction;
  after: Transaction;
};

export type TransactionUpdateComparison = {
  added: Transaction[];
  changed: TransactionChange[];
  unchanged: Transaction[];
  removed: Transaction[];
  possibleDuplicates: Transaction[];
  nextTransactions: Transaction[];
};

export type MonthPoint = {
  month: string;
  receita: number;
  despesa: number;
  lucro: number;
  saldo: number;
};

export type KpiValue = { value: number; delta: number };

export type FinancialKpis = {
  receita: KpiValue;
  despesa: KpiValue;
  lucro: KpiValue;
  saldo: KpiValue;
};
