export type TransactionType = "receita" | "despesa";

export type TransactionStatus = "Pago" | "Pendente" | "Atrasado";

export type ImportedValue = string | number | boolean | null;

export type ImportedColumn = {
  id: string;
  header: string;
  index: number;
};

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
  method?: string;
  type: TransactionType;
  amount: number;
  status?: TransactionStatus;
  additionalData?: Record<string, ImportedValue>;
  origin?: "imported" | "manual";
  manuallyModified?: boolean;
};

export type TransactionInput = {
  date: string;
  description: string;
  category: string;
  type: TransactionType;
  amount: string;
};

export type ImportField = "date" | "description" | "category" | "type" | "amount";

export type ColumnMapping = Record<ImportField, string>;

export type RawImportRow = Record<string, unknown>;

export type ImportPreview = {
  fileName: string;
  fileHash: string;
  idempotencyKey: string;
  headers: string[];
  columns: ImportedColumn[];
  rows: RawImportRow[];
  mapping: ColumnMapping;
  missingFields: ImportField[];
};

export type ImportProfile = {
  headers: string[];
  mapping: ColumnMapping;
  columns?: ImportedColumn[];
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
  manualEditsOverwritten: Transaction[];
  preservedManual: Transaction[];
  nextTransactions: Transaction[];
};

export type PossibleDuplicateGroup = {
  fingerprint: string;
  transaction: Transaction;
  occurrences: number;
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
