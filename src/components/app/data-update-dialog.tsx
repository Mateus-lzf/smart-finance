import { useRef, useState } from "react";
import { AlertTriangle, FileSpreadsheet, Loader2, RefreshCw } from "lucide-react";
import { useApp } from "@/lib/app-store";
import type {
  ColumnMapping,
  ImportPreview,
  TransactionUpdateComparison,
} from "@/lib/finance-types";
import {
  getImportUploadFile,
  hasSupportedImportDrag,
  importFields,
  normalizeImportedRows,
  readImportFile,
} from "@/lib/import-service";
import { cn } from "@/lib/utils";
import { compareTransactionUpdates, reuseImportMapping } from "@/lib/transaction-update-service";
import { groupPossibleDuplicates } from "@/lib/transaction-update-service";
import { PossibleDuplicates } from "./possible-duplicates";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Stage = "file" | "mapping" | "summary";

export function DataUpdateDialog() {
  const { transactions, replaceTransactions, importProfile, setImportProfile } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("file");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [comparison, setComparison] = useState<TransactionUpdateComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStage("file");
    setPreview(null);
    setMapping(null);
    setComparison(null);
    setError(null);
    setLoading(false);
    setDragging(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const prepareSummary = (parsed: ImportPreview, selectedMapping: ColumnMapping) => {
    const imported = normalizeImportedRows(parsed, selectedMapping);
    setComparison(compareTransactionUpdates(transactions, imported));
    setPreview(parsed);
    setMapping(selectedMapping);
    setStage("summary");
  };

  const readFile = async (file?: File) => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const parsed = await readImportFile(file);
      const selectedMapping = reuseImportMapping(parsed, importProfile);
      setPreview(parsed);
      setMapping(selectedMapping);
      const missing = importFields.some(({ key }) => !selectedMapping[key]);
      if (missing) setStage("mapping");
      else prepareSummary(parsed, selectedMapping);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível validar o arquivo.");
      setStage("file");
    } finally {
      setLoading(false);
    }
  };

  const applyUpdate = () => {
    if (!comparison || !preview || !mapping) return;
    replaceTransactions(comparison.nextTransactions);
    setImportProfile({ headers: preview.headers, mapping });
    setOpen(false);
    reset();
  };

  const ready = mapping && importFields.every(({ key }) => mapping[key]);

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <RefreshCw className="size-3.5" /> Atualizar dados
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) reset();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Atualizar dados do projeto</DialogTitle>
            <DialogDescription>
              Os dados atuais permanecem intactos até você revisar e confirmar a atualização.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="flex gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}
            </div>
          )}

          {stage === "file" && (
            <label
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(hasSupportedImportDrag(event.dataTransfer));
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                void readFile(getImportUploadFile(event.dataTransfer.files));
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border px-6 py-10 text-center transition-colors",
                dragging && "border-primary/60 bg-accent/40",
              )}
            >
              {loading ? (
                <Loader2 className="size-7 animate-spin text-primary" />
              ) : (
                <FileSpreadsheet className="size-7 text-primary" />
              )}
              <span className="font-medium">Arraste a nova versão da planilha aqui</span>
              <span className="text-sm text-muted-foreground">
                ou clique para selecionar um arquivo CSV ou XLSX
              </span>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx"
                className="sr-only"
                disabled={loading}
                onChange={(event) => void readFile(getImportUploadFile(event.target.files))}
              />
            </label>
          )}

          {stage === "mapping" && preview && mapping && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Confirme as colunas que não puderam ser identificadas automaticamente.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {importFields.map((field) => (
                  <label key={field.key} className="space-y-1.5 text-sm">
                    <span className="font-medium">{field.label}</span>
                    <select
                      value={mapping[field.key]}
                      onChange={(event) =>
                        setMapping((current) => ({ ...current!, [field.key]: event.target.value }))
                      }
                      className="w-full rounded-lg border border-border bg-card px-2.5 py-2 outline-none focus:border-primary/50"
                    >
                      <option value="">Selecione…</option>
                      {preview.headers.map((header) => (
                        <option key={header}>{header}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                    <tr>
                      {preview.headers.map((header) => (
                        <th key={header} className="px-3 py-2">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 3).map((row, index) => (
                      <tr key={index} className="border-t border-border">
                        {preview.headers.map((header) => (
                          <td key={header} className="max-w-40 truncate px-3 py-2">
                            {String(row[header] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    reset();
                    setOpen(true);
                  }}
                >
                  Escolher outro arquivo
                </Button>
                <Button
                  disabled={!ready}
                  onClick={() => {
                    try {
                      prepareSummary(preview, mapping);
                    } catch (cause) {
                      setError(
                        cause instanceof Error
                          ? cause.message
                          : "Não foi possível validar os dados.",
                      );
                    }
                  }}
                >
                  Comparar dados
                </Button>
              </DialogFooter>
            </div>
          )}

          {stage === "summary" && comparison && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  ["Novos", comparison.added.length],
                  ["Alterados", comparison.changed.length],
                  ["Removidos", comparison.removed.length],
                  ["Possíveis duplicatas", comparison.possibleDuplicates.length],
                  ["Total após atualizar", comparison.nextTransactions.length],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="rounded-xl border border-border bg-muted/30 p-3"
                  >
                    <strong className="block text-xl tabular-nums">{value}</strong>
                    <span className="text-xs text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>
              {comparison.possibleDuplicates.length > 0 && (
                <p className="flex gap-2 rounded-xl bg-warning/10 p-3 text-sm text-foreground">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                  Linhas exatamente repetidas foram identificadas como possíveis duplicatas. Todas
                  serão preservadas na atualização.
                </p>
              )}
              <PossibleDuplicates groups={groupPossibleDuplicates(comparison.possibleDuplicates)} />
              <p className="text-sm text-muted-foreground">
                Confirme para substituir os lançamentos do projeto atual. Esta ação atualizará
                também o Dashboard e os Relatórios.
              </p>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    reset();
                    setOpen(true);
                  }}
                >
                  Cancelar
                </Button>
                <Button onClick={applyUpdate}>Confirmar atualização</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
