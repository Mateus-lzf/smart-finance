import { useEffect, useState, type ReactNode } from "react";
import type { Transaction, TransactionInput } from "@/lib/finance-types";
import {
  createManualTransaction,
  editableTransactionPatch,
  type TransactionValidationErrors,
} from "@/lib/transaction-service";
import { todayCalendarDate } from "@/lib/calendar-date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const emptyInput = (): TransactionInput => ({
  date: todayCalendarDate(),
  description: "",
  category: "",
  type: "despesa",
  amount: "",
});

function inputFromTransaction(transaction: Transaction): TransactionInput {
  return {
    date: transaction.date,
    description: transaction.description,
    category: transaction.category,
    type: transaction.type,
    amount: String(transaction.amount).replace(".", ","),
  };
}

export function TransactionDialog({
  open,
  transaction,
  onOpenChange,
  onCreate,
  onUpdate,
}: {
  open: boolean;
  transaction: Transaction | null;
  onOpenChange: (open: boolean) => void;
  onCreate: (transaction: Transaction) => Promise<void>;
  onUpdate: (id: string, patch: Partial<Transaction>) => Promise<void>;
}) {
  const [input, setInput] = useState<TransactionInput>(emptyInput);
  const [errors, setErrors] = useState<TransactionValidationErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setInput(transaction ? inputFromTransaction(transaction) : emptyInput());
    setErrors({});
    setSaveError(null);
  }, [open, transaction]);

  const setField = <K extends keyof TransactionInput>(key: K, value: TransactionInput[K]) => {
    setInput((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const save = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      if (transaction) {
        const result = editableTransactionPatch(input);
        if (!result.ok) {
          setErrors(result.errors);
          return;
        }
        await onUpdate(transaction.id, result.value);
      } else {
        const result = createManualTransaction(input);
        if (!result.ok) {
          setErrors(result.errors);
          return;
        }
        await onCreate(result.value);
      }
      onOpenChange(false);
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : "Não foi possível salvar o lançamento.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{transaction ? "Editar lançamento" : "Novo lançamento"}</DialogTitle>
          <DialogDescription>
            Preencha os campos financeiros. O lançamento só será alterado depois de salvar.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <Field label="Data" error={errors.date} htmlFor="transaction-date">
            <Input
              id="transaction-date"
              type="date"
              value={input.date}
              onChange={(event) => setField("date", event.target.value)}
              aria-invalid={Boolean(errors.date)}
            />
          </Field>
          <Field label="Tipo" error={errors.type} htmlFor="transaction-type">
            <Select
              value={input.type}
              onValueChange={(value) => setField("type", value as TransactionInput["type"])}
            >
              <SelectTrigger id="transaction-type" aria-invalid={Boolean(errors.type)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="receita">Receita</SelectItem>
                <SelectItem value="despesa">Despesa</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Descrição" error={errors.description} htmlFor="transaction-description">
              <Input
                id="transaction-description"
                autoFocus
                value={input.description}
                onChange={(event) => setField("description", event.target.value)}
                aria-invalid={Boolean(errors.description)}
              />
            </Field>
          </div>
          <Field label="Categoria" error={errors.category} htmlFor="transaction-category">
            <Input
              id="transaction-category"
              value={input.category}
              onChange={(event) => setField("category", event.target.value)}
              aria-invalid={Boolean(errors.category)}
            />
          </Field>
          <Field label="Valor" error={errors.amount} htmlFor="transaction-amount">
            <Input
              id="transaction-amount"
              inputMode="decimal"
              placeholder="0,00"
              value={input.amount}
              onChange={(event) => setField("amount", event.target.value)}
              aria-invalid={Boolean(errors.amount)}
            />
          </Field>
        </div>
        {transaction?.origin === "imported" && (
          <p className="rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
            Este lançamento veio de uma planilha. Uma atualização futura do arquivo poderá
            substituir esta edição após sua confirmação.
          </p>
        )}
        {transaction?.additionalData && Object.keys(transaction.additionalData).length > 0 && (
          <p className="text-xs text-muted-foreground">
            Os dados adicionais importados serão preservados e permanecem somente para consulta.
          </p>
        )}
        {saveError && (
          <p role="alert" className="text-sm text-destructive">
            {saveError}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Salvando..." : transaction ? "Salvar alterações" : "Salvar lançamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  htmlFor,
  children,
}: {
  label: string;
  error: string | undefined;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
