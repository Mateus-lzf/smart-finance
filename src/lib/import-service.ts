import { readSheet } from "read-excel-file/browser";
import type {
  ColumnMapping,
  ImportField,
  ImportPreview,
  RawImportRow,
  Transaction,
  TransactionType,
} from "./finance-types";
import { parseCalendarDate } from "./calendar-date";

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

function normalized(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectMapping(headers: string[]): ColumnMapping {
  return Object.fromEntries(
    importFields.map(({ key }) => {
      const match = headers.find((header) => aliases[key].includes(normalized(header)));
      return [key, match ?? ""];
    }),
  ) as ColumnMapping;
}

export async function readImportFile(file: File): Promise<ImportPreview> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !["csv", "xlsx"].includes(extension)) {
    throw new Error("Formato inválido. Selecione um arquivo CSV ou XLSX.");
  }
  let matrix: unknown[][];
  if (extension === "csv") matrix = parseCsv(await file.text());
  else matrix = await readSheet(file);
  const [headerRow, ...dataRows] = matrix;
  if (!headerRow?.length) throw new Error("A planilha não possui cabeçalhos.");
  const headers = headerRow.map((value, index) => String(value ?? `Coluna ${index + 1}`).trim());
  const rows = dataRows
    .filter((row) => row.some((cell) => cell !== null && String(cell).trim() !== ""))
    .map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])),
    ) as RawImportRow[];
  if (rows.length === 0) throw new Error("O arquivo não possui dados para importar.");
  const mapping = detectMapping(headers);
  return {
    fileName: file.name,
    headers,
    rows,
    mapping,
    missingFields: importFields.map((field) => field.key).filter((field) => !mapping[field]),
  };
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
  const text = normalized(value);
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
      method: "Importado",
      type,
      amount,
      status: "Pago",
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
