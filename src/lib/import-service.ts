import { readSheet } from "read-excel-file/browser";
import type {
  ColumnMapping,
  ImportField,
  ImportPreview,
  ImportedColumn,
  ImportedValue,
  RawImportRow,
  Transaction,
  TransactionType,
} from "./finance-types";
import { formatCalendarDate, parseCalendarDate } from "./calendar-date";

export const importFields: { key: ImportField; label: string }[] = [
  { key: "date", label: "Data" },
  { key: "description", label: "Descrição" },
  { key: "category", label: "Categoria" },
  { key: "type", label: "Tipo" },
  { key: "amount", label: "Valor" },
];

const aliases: Record<ImportField, string[]> = {
  date: ["data", "date", "dt", "data lancamento", "data transacao", "vencimento"],
  description: ["descricao", "description", "historico", "lancamento", "nome", "memo"],
  category: ["categoria", "category", "grupo", "classificacao", "plano de contas"],
  type: ["tipo", "type", "natureza", "entrada saida", "receita despesa", "movimento"],
  amount: ["valor", "value", "amount", "montante", "total", "quantia"],
};

export function normalizeImportHeader(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isSupportedImportFile(file: Pick<File, "name">) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension === "csv" || extension === "xlsx";
}

export function getImportUploadFile(files?: ArrayLike<File> | null) {
  return files?.[0];
}

export function formatImportPreviewValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    const date = parseCalendarDate(value);
    return date ? formatCalendarDate(date) : "";
  }
  return String(value);
}

const supportedImportMimeTypes = new Set([
  "text/csv",
  "application/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export function hasSupportedImportDrag(transfer: Pick<DataTransfer, "files" | "items">) {
  const file = getImportUploadFile(transfer.files);
  if (file) return isSupportedImportFile(file);
  return Array.from(transfer.items ?? []).some(
    (item) => item.kind === "file" && supportedImportMimeTypes.has(item.type.toLowerCase()),
  );
}

function detectMapping(columns: ImportedColumn[]): ColumnMapping {
  return Object.fromEntries(
    importFields.map(({ key }) => {
      const match = columns.find(({ header }) =>
        aliases[key].includes(normalizeImportHeader(header)),
      );
      return [key, match?.id ?? ""];
    }),
  ) as ColumnMapping;
}

export async function readImportFile(file: File): Promise<ImportPreview> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!isSupportedImportFile(file)) {
    throw new Error("Formato inválido. Selecione um arquivo CSV ou XLSX.");
  }
  let matrix: unknown[][];
  if (extension === "csv") matrix = parseCsv(await file.text());
  else matrix = await readSheet(file);
  const [headerRow, ...dataRows] = matrix;
  if (!headerRow?.length) throw new Error("A planilha não possui cabeçalhos.");
  const headers = headerRow.map((value, index) => {
    const header = String(value ?? "").trim();
    return header || `Coluna ${index + 1}`;
  });
  const headerOccurrences = new Map<string, number>();
  const columns = headers.map((header, index) => {
    const normalized = normalizeImportHeader(header) || `coluna-${index + 1}`;
    const occurrence = (headerOccurrences.get(normalized) ?? 0) + 1;
    headerOccurrences.set(normalized, occurrence);
    return { id: `column:${normalized}:${occurrence}`, header, index };
  });
  const rows = dataRows
    .filter((row) => row.some((cell) => cell !== null && String(cell).trim() !== ""))
    .map((row) =>
      Object.fromEntries(columns.map((column) => [column.id, row[column.index] ?? null])),
    ) as RawImportRow[];
  if (rows.length === 0) throw new Error("O arquivo não possui dados para importar.");
  const mapping = detectMapping(columns);
  return {
    fileName: file.name,
    headers,
    columns,
    rows,
    mapping,
    missingFields: importFields.map((field) => field.key).filter((field) => !mapping[field]),
  };
}

function preserveImportedValue(value: unknown): ImportedValue {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return parseCalendarDate(value);
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return String(value);
}

function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index]!;
    if (char === '"') {
      if (quoted && clean[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && clean[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function parseAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? Math.abs(value) : null;
  let text = String(value ?? "")
    .trim()
    .replace(/[^\d,.-]/g, "");
  if (!text) return null;
  if (text.includes(",") && text.includes(".")) text = text.replace(/\./g, "").replace(",", ".");
  else if (text.includes(",")) text = text.replace(",", ".");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? Math.abs(parsed) : null;
}

function parseType(value: unknown, originalAmount: unknown): TransactionType | null {
  const text = normalizeImportHeader(value);
  if (["receita", "entrada", "credito", "credit", "income", "r"].includes(text)) return "receita";
  if (["despesa", "saida", "debito", "debit", "expense", "d"].includes(text)) return "despesa";
  const amount =
    typeof originalAmount === "number"
      ? originalAmount
      : Number(String(originalAmount).replace(",", "."));
  return Number.isFinite(amount) && amount < 0 ? "despesa" : null;
}

export function normalizeImportedRows(
  preview: ImportPreview,
  mapping = preview.mapping,
): Transaction[] {
  const missing = importFields.map((field) => field.key).filter((field) => !mapping[field]);
  if (missing.length) throw new Error("Associe todas as colunas obrigatórias antes de continuar.");
  const transactions: Transaction[] = [];
  const errors: number[] = [];

  preview.rows.forEach((row, index) => {
    const date = parseCalendarDate(row[mapping.date]);
    const amount = parseAmount(row[mapping.amount]);
    const type = parseType(row[mapping.type], row[mapping.amount]);
    const description = String(row[mapping.description] ?? "").trim();
    if (!date || amount === null || !type || !description) {
      errors.push(index + 2);
      return;
    }
    transactions.push({
      id: `IMP-${Date.now()}-${index + 1}`,
      date,
      description,
      category: String(row[mapping.category] ?? "Sem categoria").trim() || "Sem categoria",
      type,
      amount,
      additionalData: Object.fromEntries(
        preview.columns
          .filter((column) => !Object.values(mapping).includes(column.id))
          .map((column) => [column.id, preserveImportedValue(row[column.id])]),
      ),
    });
  });

  if (errors.length) {
    const sample = errors.slice(0, 5).join(", ");
    throw new Error(
      `Não foi possível interpretar data, descrição, tipo ou valor nas linhas ${sample}${errors.length > 5 ? "…" : ""}.`,
    );
  }
  if (!transactions.length) throw new Error("Nenhuma transação válida foi encontrada.");
  return transactions;
}
