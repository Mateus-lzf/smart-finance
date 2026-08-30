import { strToU8, zipSync, type Zippable } from "fflate";
import { serializeCsv } from "../csv-serialization";
import { accountExportV1Schema, type AccountExportV1 } from "./account-export-schema";

export const ACCOUNT_EXPORT_V1_FILES = [
  "README.txt",
  "manifest.json",
  "account.json",
  "projects.csv",
  "transactions.csv",
  "import-profiles.json",
  "import-runs.csv",
  "project-preferences.json",
] as const;

export type AccountExportV1FileName = (typeof ACCOUNT_EXPORT_V1_FILES)[number];
export type AccountExportV1Files = Record<AccountExportV1FileName, string>;

// ZIP timestamps use local calendar fields; midday keeps the value inside the
// format's 1980 lower bound in negative UTC offsets as well.
const ZIP_TIMESTAMP = new Date("1980-01-02T12:00:00.000Z");

function compareText(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => compareText(a, b))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

export function serializeStableJson(value: unknown) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

function normalizeMoneyForCsv(value: string) {
  return value.replace(".", ",");
}

function sortExportData(data: AccountExportV1): AccountExportV1 {
  return {
    ...data,
    projects: [...data.projects].sort(
      (a, b) => compareText(a.createdAt, b.createdAt) || compareText(a.id, b.id),
    ),
    transactions: [...data.transactions].sort(
      (a, b) =>
        compareText(a.projectId, b.projectId) ||
        compareText(a.date, b.date) ||
        compareText(a.id, b.id),
    ),
    importProfiles: [...data.importProfiles].sort((a, b) => compareText(a.projectId, b.projectId)),
    importRuns: [...data.importRuns].sort(
      (a, b) =>
        compareText(a.projectId, b.projectId) ||
        compareText(a.createdAt, b.createdAt) ||
        compareText(a.id, b.id),
    ),
    projectPreferences: [...data.projectPreferences].sort((a, b) =>
      compareText(a.projectId, b.projectId),
    ),
  };
}

function serializeProjects(data: AccountExportV1) {
  return serializeCsv(
    ["id", "owner_user_id", "name", "type", "description", "version", "created_at", "updated_at"],
    data.projects.map((project) => [
      project.id,
      project.ownerUserId,
      project.name,
      project.type ?? "",
      project.description ?? "",
      String(project.version),
      project.createdAt,
      project.updatedAt,
    ]),
  );
}

function serializeTransactions(data: AccountExportV1) {
  return serializeCsv(
    [
      "id",
      "project_id",
      "owner_user_id",
      "date",
      "description",
      "category",
      "type",
      "amount",
      "currency",
      "origin",
      "manually_modified",
      "additional_data_json",
      "import_run_id",
      "version",
      "created_at",
      "updated_at",
    ],
    data.transactions.map((transaction) => [
      transaction.id,
      transaction.projectId,
      transaction.ownerUserId,
      transaction.date,
      transaction.description,
      transaction.category,
      transaction.type,
      normalizeMoneyForCsv(transaction.amount),
      "BRL",
      transaction.origin,
      String(transaction.manuallyModified),
      JSON.stringify(stableValue(transaction.additionalData)),
      transaction.importRunId ?? "",
      String(transaction.version),
      transaction.createdAt,
      transaction.updatedAt,
    ]),
  );
}

function serializeImportRuns(data: AccountExportV1) {
  return serializeCsv(
    [
      "id",
      "project_id",
      "owner_user_id",
      "operation",
      "status",
      "original_filename",
      "file_hash",
      "row_count",
      "added_count",
      "changed_count",
      "removed_count",
      "duplicate_count",
      "unchanged_count",
      "preserved_manual_count",
      "manual_overwrite_count",
      "base_project_version",
      "result_project_version",
      "error_code",
      "created_at",
      "completed_at",
    ],
    data.importRuns.map((run) => [
      run.id,
      run.projectId,
      run.ownerUserId,
      run.operation,
      run.status,
      run.originalFilename ?? "",
      run.fileHash ?? "",
      String(run.rowCount),
      String(run.addedCount),
      String(run.changedCount),
      String(run.removedCount),
      String(run.duplicateCount),
      String(run.unchangedCount),
      String(run.preservedManualCount),
      String(run.manualOverwriteCount),
      run.baseProjectVersion === null ? "" : String(run.baseProjectVersion),
      run.resultProjectVersion === null ? "" : String(run.resultProjectVersion),
      run.errorCode ?? "",
      run.createdAt,
      run.completedAt ?? "",
    ]),
  );
}

function buildReadme(generatedAt: string) {
  return [
    "Smart Finance - exportação integral da conta (formato v1)",
    "",
    `Gerado em: ${generatedAt}`,
    "Locale: pt-BR",
    "Moeda: BRL",
    "",
    "Este pacote reúne os dados portáveis da conta e os registros financeiros remotos.",
    "Os identificadores project_id relacionam lançamentos, importações e preferências aos projetos.",
    "Datas financeiras usam YYYY-MM-DD. Timestamps usam ISO 8601.",
    "Valores monetários são completos, com duas casas decimais e sem abreviação.",
    "additional_data_json contém JSON e preserva strings, números, booleanos e null.",
    "",
    "O pacote não contém senhas, tokens, cookies, sessões, secrets ou credenciais administrativas.",
    "Tema e projeto ativo são preferências locais deste dispositivo e não integram os dados financeiros remotos.",
    "Proteja este arquivo: ele contém informações financeiras potencialmente sensíveis.",
    "",
  ].join("\r\n");
}

export function createAccountExportV1Files(
  input: AccountExportV1,
  generatedAt: string,
): AccountExportV1Files {
  const data = sortExportData(accountExportV1Schema.parse(input));
  const normalizedGeneratedAt = new Date(generatedAt).toISOString();
  const manifest = {
    format: "smart-finance-account-export",
    version: 1,
    generatedAt: normalizedGeneratedAt,
    locale: "pt-BR",
    currency: "BRL",
    files: [...ACCOUNT_EXPORT_V1_FILES],
    counts: {
      projects: data.projects.length,
      transactions: data.transactions.length,
      importProfiles: data.importProfiles.length,
      importRuns: data.importRuns.length,
      projectPreferences: data.projectPreferences.length,
    },
  };

  return {
    "README.txt": buildReadme(normalizedGeneratedAt),
    "manifest.json": serializeStableJson(manifest),
    "account.json": serializeStableJson(data.account),
    "projects.csv": serializeProjects(data),
    "transactions.csv": serializeTransactions(data),
    "import-profiles.json": serializeStableJson(data.importProfiles),
    "import-runs.csv": serializeImportRuns(data),
    "project-preferences.json": serializeStableJson(data.projectPreferences),
  };
}

export function createAccountExportV1Zip(input: AccountExportV1, generatedAt: string) {
  const files = createAccountExportV1Files(input, generatedAt);
  const zipInput: Zippable = {};
  for (const name of ACCOUNT_EXPORT_V1_FILES) {
    zipInput[name] = [strToU8(files[name]), { level: 6, mtime: ZIP_TIMESTAMP }];
  }
  const bytes = zipSync(zipInput);
  return {
    bytes,
    fileName: `smart-finance-export-v1-${new Date(generatedAt).toISOString().slice(0, 10)}.zip`,
    files,
  };
}
