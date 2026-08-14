import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Columns3 } from "lucide-react";
import type { ImportedColumn, Transaction } from "@/lib/finance-types";
import { formatCalendarDate } from "@/lib/calendar-date";
import { brl } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PAGE_SIZE = 25;
const coreColumns = [
  { id: "date", label: "Data" },
  { id: "description", label: "Descrição" },
  { id: "category", label: "Categoria" },
  { id: "type", label: "Tipo" },
  { id: "amount", label: "Valor" },
];

export function ReportTable({
  transactions,
  additionalColumns,
}: {
  transactions: Transaction[];
  additionalColumns: ImportedColumn[];
}) {
  const available = useMemo(
    () => [
      ...coreColumns,
      ...additionalColumns.map((column) => ({ id: column.id, label: column.header })),
    ],
    [additionalColumns],
  );
  const [visible, setVisible] = useState(coreColumns.map((column) => column.id));
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [transactions]);
  const totalPages = Math.max(1, Math.ceil(transactions.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rows = transactions.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const selected = available.filter((column) => visible.includes(column.id));
  const toggle = (id: string, checked: boolean) =>
    setVisible((current) =>
      checked ? [...new Set([...current, id])] : current.filter((value) => value !== id),
    );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {transactions.length} lançamento{transactions.length === 1 ? "" : "s"} no relatório
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Columns3 className="size-3.5" /> Colunas
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
            <DropdownMenuLabel>Exibir na tabela</DropdownMenuLabel>
            {available.map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={visible.includes(column.id)}
                onCheckedChange={(checked) => toggle(column.id, Boolean(checked))}
              >
                {column.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                {selected.map((column) => (
                  <th
                    key={column.id}
                    className={`px-4 py-2.5 font-medium ${column.id === "amount" ? "text-right" : "text-left"}`}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border/70 last:border-0">
                  {selected.map((column) => {
                    let value: React.ReactNode;
                    if (column.id === "date") value = formatCalendarDate(row.date);
                    else if (column.id === "description") value = row.description;
                    else if (column.id === "category") value = row.category || "Sem categoria";
                    else if (column.id === "type")
                      value = <span className="capitalize">{row.type}</span>;
                    else if (column.id === "amount") value = brl(Math.abs(row.amount));
                    else {
                      const additional = row.additionalData?.[column.id];
                      value =
                        additional === null ||
                        additional === undefined ||
                        String(additional).trim() === ""
                          ? "Não informado"
                          : String(additional);
                    }
                    return (
                      <td
                        key={column.id}
                        className={`max-w-72 truncate px-4 py-2.5 ${column.id === "amount" || typeof row.additionalData?.[column.id] === "number" ? "text-right tabular-nums" : "text-left"}`}
                      >
                        {value}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td
                    colSpan={Math.max(selected.length, 1)}
                    className="px-4 py-10 text-center text-muted-foreground"
                  >
                    Nenhum lançamento encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {transactions.length > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
            <span>
              {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, transactions.length)}{" "}
              de {transactions.length}
            </span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={safePage === 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={safePage === totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
