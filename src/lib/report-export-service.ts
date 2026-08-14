import { formatCalendarDate } from "./calendar-date";
import type { ImportedColumn, ImportedValue, Transaction } from "./finance-types";
import type { FinancialReport } from "./report-types";

export type ReportExportColumn = { id: string; label: string };

const coreColumns: ReportExportColumn[] = [
  { id: "date", label: "Data" },
  { id: "description", label: "Descrição" },
  { id: "category", label: "Categoria" },
  { id: "type", label: "Tipo" },
  { id: "amount", label: "Valor" },
];
export const DEFAULT_REPORT_COLUMN_IDS = coreColumns.map((column) => column.id);

export function getReportExportColumns(additionalColumns: ImportedColumn[]) {
  return [
    ...coreColumns,
    ...additionalColumns.map((column) => ({ id: column.id, label: column.header })),
  ];
}

function textualValue(value: ImportedValue | undefined) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return String(value);
}

function protectText(value: string) {
  return /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
}

function escapeCsvText(value: string) {
  const protectedValue = protectText(value);
  return /[;"\r\n]|^\s|\s$/.test(protectedValue)
    ? `"${protectedValue.replace(/"/g, '""')}"`
    : protectedValue;
}

function numericCsvValue(value: number) {
  return value.toFixed(2).replace(".", ",");
}

function cellValue(row: Transaction, columnId: string): string | number {
  if (columnId === "date") return formatCalendarDate(row.date);
  if (columnId === "description") return row.description;
  if (columnId === "category") return row.category || "Sem categoria";
  if (columnId === "type") return row.type === "receita" ? "Receita" : "Despesa";
  if (columnId === "amount")
    return row.type === "receita" ? Math.abs(row.amount) : -Math.abs(row.amount);
  const value = row.additionalData?.[columnId];
  return typeof value === "number" ? value : textualValue(value);
}

function serializeCell(value: string | number) {
  return typeof value === "number" ? numericCsvValue(value) : escapeCsvText(value);
}

export function serializeReportCsv(report: FinancialReport, columns: ReportExportColumn[]) {
  const header = columns.map((column) => escapeCsvText(column.label)).join(";");
  const rows = report.transactions.map((row) =>
    columns.map((column) => serializeCell(cellValue(row, column.id))).join(";"),
  );
  return `\uFEFF${[header, ...rows].join("\r\n")}`;
}

function slug(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "projeto"
  );
}

export function reportCsvFileName(projectName: string, report: Pick<FinancialReport, "filters">) {
  const { startDate, endDate } = report.filters;
  const period = startDate && endDate ? `-${startDate}-a-${endDate}` : "";
  return `smart-finance-${slug(projectName)}${period}.csv`;
}

export function downloadReportCsv(
  report: FinancialReport,
  columns: ReportExportColumn[],
  projectName: string,
) {
  const blob = new Blob([serializeReportCsv(report, columns)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = reportCsvFileName(projectName, report);
  anchor.click();
  URL.revokeObjectURL(url);
}
