import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  AlertTriangle,
  Check,
  FileSpreadsheet,
  Loader2,
  UploadCloud,
  Sparkles,
} from "lucide-react";
import { useApp } from "@/lib/app-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  importFields,
  getImportUploadFile,
  hasSupportedImportDrag,
  normalizeImportedRows,
  readImportFile,
} from "@/lib/import-service";
import type { ColumnMapping, ImportPreview } from "@/lib/finance-types";

export const Route = createFileRoute("/importar")({
  head: () => ({
    meta: [
      { title: "Importar planilha — Clareza" },
      { name: "description", content: "Envie um Excel ou CSV e organize seus dados financeiros." },
    ],
  }),
  component: ImportPage,
});

const steps = [
  "Lendo planilha",
  "Detectando colunas",
  "Validando lançamentos",
  "Organizando categorias",
  "Atualizando dashboard",
];

function ImportPage() {
  const navigate = useNavigate();
  const { project, createProject, setOnboarded, replaceTransactions, setImportProfile } = useApp();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [step, setStep] = useState(-1);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState("");

  const commit = async (parsed: ImportPreview, selectedMapping = parsed.mapping) => {
    setPreview(null);
    setMapping(null);
    setStep(2);
    setError(null);
    try {
      const rows = normalizeImportedRows(parsed, selectedMapping);
      const targetProject = project ?? createProject({ name: newProjectName });
      setStep(3);
      replaceTransactions(rows, targetProject.id);
      setImportProfile({ headers: parsed.headers, mapping: selectedMapping }, targetProject.id);
      setStep(4);
      setOnboarded(true);
      await new Promise((resolve) => setTimeout(resolve, 450));
      setStep(steps.length);
      await new Promise((resolve) => setTimeout(resolve, 650));
      await navigate({ to: "/dashboard" });
    } catch (cause) {
      setStep(-1);
      setError(cause instanceof Error ? cause.message : "Não foi possível importar o arquivo.");
    }
  };

  const start = async (file: File) => {
    setFileName(file.name);
    setError(null);
    setStep(0);
    try {
      const parsed = await readImportFile(file);
      setStep(1);
      if (parsed.missingFields.length || !project) {
        setPreview(parsed);
        setMapping(parsed.mapping);
        setStep(-1);
        return;
      }
      await commit(parsed);
    } catch (cause) {
      setStep(-1);
      setError(cause instanceof Error ? cause.message : "Não foi possível ler o arquivo.");
    }
  };

  const readyToMap =
    mapping &&
    importFields.every(({ key }) => mapping[key]) &&
    (Boolean(project) || Boolean(newProjectName.trim()));

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-16">
      <div className={cn("w-full", preview ? "max-w-4xl" : "max-w-xl")}>
        <AnimatePresence mode="wait">
          {preview && mapping ? (
            <motion.div
              key="mapping"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="surface p-7"
            >
              <div className="flex items-start gap-3 border-b border-border pb-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warning/15 text-warning">
                  <AlertTriangle className="size-5" />
                </span>
                <div>
                  <h1 className="text-lg font-semibold">
                    {preview.missingFields.length
                      ? "Confirme as colunas da planilha"
                      : "Crie o projeto da importação"}
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {preview.missingFields.length
                      ? `Algumas colunas não foram reconhecidas automaticamente em ${preview.fileName}.`
                      : `Informe o nome do projeto que receberá os dados de ${preview.fileName}.`}
                  </p>
                </div>
              </div>

              {!project && (
                <div className="mt-5 max-w-sm space-y-1.5 text-left">
                  <Label htmlFor="import-project-name">Nome do novo projeto</Label>
                  <Input
                    id="import-project-name"
                    autoFocus
                    value={newProjectName}
                    onChange={(event) => setNewProjectName(event.target.value)}
                    placeholder="Ex.: Minha empresa"
                  />
                </div>
              )}

              {preview.missingFields.length > 0 && (
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {importFields.map((field) => (
                    <label key={field.key} className="space-y-1.5 text-sm">
                      <span className="font-medium">{field.label}</span>
                      <select
                        value={mapping[field.key]}
                        onChange={(event) =>
                          setMapping((current) => ({
                            ...current!,
                            [field.key]: event.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-border bg-card px-2.5 py-2 text-sm outline-none focus:border-primary/50"
                      >
                        <option value="">Selecione…</option>
                        {preview.headers.map((header) => (
                          <option key={header} value={header}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              )}

              <div className="mt-6 overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[680px] text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      {preview.headers.map((header) => (
                        <th key={header} className="px-3 py-2 font-medium">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 5).map((row, index) => (
                      <tr key={index} className="border-t border-border">
                        {preview.headers.map((header) => (
                          <td key={header} className="max-w-48 truncate px-3 py-2">
                            {String(row[header] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-5 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Prévia das primeiras {Math.min(5, preview.rows.length)} linhas
                </p>
                <Button disabled={!readyToMap} onClick={() => void commit(preview, mapping)}>
                  Importar lançamentos
                </Button>
              </div>
            </motion.div>
          ) : step < 0 ? (
            <motion.div key="drop" exit={{ opacity: 0, y: -8 }} className="text-center">
              <h1 className="text-2xl font-semibold tracking-tight">Importe sua planilha</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Aceitamos .xlsx e .csv com data, descrição, categoria, tipo e valor.
              </p>

              {error && (
                <p className="mt-5 flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-left text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}
                </p>
              )}

              <label
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(hasSupportedImportDrag(event.dataTransfer));
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  const file = getImportUploadFile(event.dataTransfer.files);
                  if (file) void start(file);
                }}
                className={cn(
                  "mt-8 flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-card/60 px-6 py-14 transition-colors",
                  dragging && "border-primary/60 bg-accent/40",
                )}
              >
                <span className="grid size-12 place-items-center rounded-xl bg-accent text-accent-foreground">
                  <UploadCloud className="size-5" />
                </span>
                <span className="text-sm font-medium">Arraste seu arquivo aqui</span>
                <span className="text-xs text-muted-foreground">ou clique para selecionar</span>
                <input
                  type="file"
                  className="hidden"
                  accept=".csv,.xlsx"
                  onChange={(event) => {
                    const file = getImportUploadFile(event.target.files);
                    if (file) void start(file);
                    event.target.value = "";
                  }}
                />
              </label>
            </motion.div>
          ) : (
            <motion.div
              key="progress"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="surface p-7"
            >
              <div className="flex items-center gap-3 border-b border-border pb-5">
                <span className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground">
                  <FileSpreadsheet className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {step >= steps.length ? "Tudo pronto" : "Organizando seus dados…"}
                  </p>
                </div>
              </div>
              <ul className="mt-5 space-y-3">
                {steps.map((label, index) => {
                  const done = index < step;
                  const active = index === step;
                  return (
                    <li key={label} className="flex items-center gap-3 text-sm">
                      <span
                        className={cn(
                          "grid size-5 shrink-0 place-items-center rounded-full border",
                          done && "border-primary bg-primary text-primary-foreground",
                          active && "border-primary text-primary",
                          !done && !active && "border-border text-muted-foreground",
                        )}
                      >
                        {done ? (
                          <Check className="size-3" />
                        ) : active ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : null}
                      </span>
                      <span
                        className={cn(done && "text-foreground", !done && "text-muted-foreground")}
                      >
                        {label}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {step >= steps.length && (
                <p className="mt-6 flex items-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-sm text-accent-foreground">
                  <Sparkles className="size-4" />
                  Dados importados. Abrindo seu dashboard…
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
