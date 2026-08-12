import { useMemo, useState } from "react";
import { Search, Plus, Upload, Filter, Columns3, Trash2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useApp } from "@/lib/app-store";
import { brl } from "@/lib/mock-data";
import type { Transaction } from "@/lib/finance-types";
import { parseCurrencyInput } from "@/lib/finance-service";
import { formatCalendarDate, todayCalendarDate } from "@/lib/calendar-date";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DataUpdateDialog } from "./data-update-dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Filters = { receita: boolean; despesa: boolean };

function EditableCell({
  value,
  onChange,
  align = "left",
}: {
  value: string;
  onChange: (v: string) => void;
  align?: "left" | "right";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (editing)
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          onChange(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className={cn(
          "w-full rounded-md border border-primary/50 bg-card px-1.5 py-0.5 text-left text-sm outline-none",
          align === "right" && "text-right",
        )}
      />
    );
  return (
    <button
      onClick={() => setEditing(true)}
      className={cn(
        "-mx-1.5 w-[calc(100%+0.75rem)] rounded-md px-1.5 py-0.5 text-left text-sm transition-colors hover:bg-muted",
        align === "right" && "text-right",
      )}
    >
      {value}
    </button>
  );
}

export function DataTable() {
  const {
    transactions: rows,
    importProfile,
    visibleColumns,
    setVisibleColumns,
    updateTransaction,
    addTransaction,
    deleteTransaction,
  } = useApp();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>({ receita: true, despesa: true });

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          filters[r.type] &&
          (query === "" ||
            `${r.description} ${r.category} ${Object.values(r.additionalData ?? {}).join(" ")} ${r.id}`
              .toLowerCase()
              .includes(query.toLowerCase())),
      ),
    [rows, query, filters],
  );

  const patch = (id: string, key: keyof Transaction, value: string) =>
    updateTransaction(id, {
      [key]: key === "amount" ? parseCurrencyInput(value) : value,
    });

  const addRow = () =>
    addTransaction({
      id: `TX-${Math.floor(Math.random() * 9000) + 1000}`,
      date: todayCalendarDate(),
      description: "Novo lançamento",
      category: "Sem categoria",
      type: "despesa",
      amount: 0,
    });

  const coreColumns = [
    { id: "date", label: "Data" },
    { id: "description", label: "Descrição" },
    { id: "category", label: "Categoria" },
    { id: "type", label: "Tipo" },
    { id: "amount", label: "Valor" },
  ];
  const mappedColumns = new Set(Object.values(importProfile?.mapping ?? {}));
  const additionalColumns = (importProfile?.columns ?? [])
    .filter((column) => !mappedColumns.has(column.id))
    .map((column) => ({ id: column.id, label: column.header }));
  const availableColumns = [...coreColumns, ...additionalColumns];
  const selectedColumns = availableColumns.filter((column) => visibleColumns.includes(column.id));

  const toggleColumn = (id: string, checked: boolean) => {
    const next = checked
      ? [...visibleColumns, id]
      : visibleColumns.filter((column) => column !== id);
    setVisibleColumns(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-soft focus-within:border-primary/50">
          <Search className="size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar lançamentos, categorias, formas de pagamento…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Filter className="size-3.5" /> Filtros
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Tipo</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={filters.receita}
              onCheckedChange={(v) => setFilters((f) => ({ ...f, receita: Boolean(v) }))}
            >
              Receitas
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={filters.despesa}
              onCheckedChange={(v) => setFilters((f) => ({ ...f, despesa: Boolean(v) }))}
            >
              Despesas
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Columns3 className="size-3.5" /> Colunas visíveis
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Exibir na tabela
            </DropdownMenuLabel>
            {availableColumns.map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={visibleColumns.includes(column.id)}
                onCheckedChange={(checked) => toggleColumn(column.id, Boolean(checked))}
              >
                {column.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={addRow}>
          <Plus className="size-3.5" /> Nova linha
        </Button>
        <DataUpdateDialog />
        <Button size="sm" className="gap-1.5" asChild>
          <Link to="/importar">
            <Upload className="size-3.5" /> Importar planilha
          </Link>
        </Button>
      </div>

      <div className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                {selectedColumns.map((column) => (
                  <th
                    key={column.id}
                    className={cn(
                      "px-4 py-2.5 font-medium",
                      column.id === "amount" ? "text-right" : "text-left",
                    )}
                  >
                    {column.label}
                  </th>
                ))}
                <th className="w-12 px-2 py-2.5 text-right">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-border/70 last:border-0 hover:bg-muted/30"
                >
                  {selectedColumns.map((column) => {
                    if (column.id === "date")
                      return (
                        <td
                          key={column.id}
                          className="tabular px-4 py-2 text-left text-muted-foreground"
                        >
                          {formatCalendarDate(r.date)}
                        </td>
                      );
                    if (column.id === "description")
                      return (
                        <td key={column.id} className="px-4 py-2 text-left">
                          <EditableCell
                            value={r.description}
                            onChange={(value) => patch(r.id, "description", value)}
                          />
                        </td>
                      );
                    if (column.id === "category")
                      return (
                        <td key={column.id} className="px-4 py-2 text-left">
                          <EditableCell
                            value={r.category}
                            onChange={(value) => patch(r.id, "category", value)}
                          />
                        </td>
                      );
                    if (column.id === "type")
                      return (
                        <td key={column.id} className="px-4 py-2 text-left capitalize">
                          {r.type}
                        </td>
                      );
                    if (column.id === "amount")
                      return (
                        <td
                          key={column.id}
                          className={cn(
                            "tabular px-4 py-2 text-right font-medium",
                            r.type === "receita" ? "text-primary" : "text-foreground",
                          )}
                        >
                          <EditableCell
                            align="right"
                            value={`${r.type === "receita" ? "+" : "−"} ${brl(r.amount)}`}
                            onChange={(value) => patch(r.id, "amount", value)}
                          />
                        </td>
                      );
                    const value = r.additionalData?.[column.id];
                    return (
                      <td
                        key={column.id}
                        className={cn(
                          "max-w-64 truncate px-4 py-2",
                          typeof value === "number" ? "text-right tabular-nums" : "text-left",
                        )}
                      >
                        {value === null || value === undefined ? "—" : String(value)}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      title="Excluir lançamento"
                      onClick={() => {
                        if (window.confirm(`Excluir o lançamento “${r.description}”?`))
                          deleteTransaction(r.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={selectedColumns.length + 1}
                    className="px-4 py-10 text-center text-sm text-muted-foreground"
                  >
                    Nenhum lançamento encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          <span>{filtered.length} lançamentos</span>
          <span>Clique em qualquer célula para editar</span>
        </div>
      </div>
    </div>
  );
}
