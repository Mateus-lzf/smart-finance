import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type { Transaction } from "@/lib/finance-types";
import { formatCalendarDate } from "@/lib/calendar-date";
import { brl } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function DashboardRecentTransactions({ rows }: { rows: Transaction[] }) {
  if (!rows.length)
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Não há lançamentos neste período.
      </p>
    );

  return (
    <>
      <div className="hidden overflow-hidden rounded-lg border border-border/70 md:block">
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/35 text-left text-xs text-muted-foreground">
              <th className="w-24 px-3 py-2 font-medium">Data</th>
              <th className="px-3 py-2 font-medium">Descrição</th>
              <th className="w-44 px-3 py-2 font-medium">Categoria</th>
              <th className="w-24 px-3 py-2 font-medium">Tipo</th>
              <th className="w-32 px-3 py-2 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/60 last:border-0">
                <td className="tabular whitespace-nowrap px-3 py-2 text-muted-foreground">
                  {formatCalendarDate(row.date)}
                </td>
                <td className="truncate px-3 py-2 font-medium">{row.description}</td>
                <td className="truncate px-3 py-2 text-muted-foreground">
                  {row.category || "Sem categoria"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 capitalize text-muted-foreground">
                  {row.type}
                </td>
                <td
                  className={cn(
                    "tabular whitespace-nowrap px-3 py-2 text-right font-medium",
                    row.type === "receita" && "text-primary",
                  )}
                >
                  {row.type === "receita" ? "+" : "−"} {brl(Math.abs(row.amount))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-border/70 md:hidden">
        {rows.map((row) => (
          <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3 first:pt-0">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{row.description}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {formatCalendarDate(row.date)} · {row.category || "Sem categoria"}
              </p>
            </div>
            <div className="text-right">
              <p
                className={cn(
                  "tabular whitespace-nowrap text-sm font-medium",
                  row.type === "receita" && "text-primary",
                )}
              >
                {row.type === "receita" ? "+" : "−"} {brl(Math.abs(row.amount))}
              </p>
              <p className="mt-0.5 text-xs capitalize text-muted-foreground">{row.type}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex justify-end">
        <Button variant="ghost" size="sm" asChild className="gap-1.5">
          <Link to="/dados">
            Ver todos em Dados <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>
    </>
  );
}
