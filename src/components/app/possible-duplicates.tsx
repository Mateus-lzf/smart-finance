import type { PossibleDuplicateGroup } from "@/lib/finance-types";
import { formatCalendarDate } from "@/lib/calendar-date";
import { brl } from "@/lib/mock-data";

export function PossibleDuplicates({ groups }: { groups: PossibleDuplicateGroup[] }) {
  if (!groups.length) return null;
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-warning/30">
      <div className="bg-warning/10 px-3 py-2 text-sm">
        <strong>Possíveis duplicatas</strong>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Todas as ocorrências abaixo serão preservadas por padrão.
        </p>
      </div>
      <div className="space-y-2 p-2 md:hidden">
        {groups.map(({ fingerprint, transaction, occurrences }) => (
          <article key={fingerprint} className="rounded-lg border border-border bg-card/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{formatCalendarDate(transaction.date)}</span>
              <span className="capitalize">{transaction.type}</span>
            </div>
            <p className="mt-2 break-words text-sm font-medium">{transaction.description}</p>
            <p className="mt-1 break-words text-xs text-muted-foreground">
              Categoria: {transaction.category}
            </p>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-border/70 pt-2">
              <div>
                <span className="block text-[11px] text-muted-foreground">Valor</span>
                <strong className="text-sm tabular-nums">{brl(transaction.amount)}</strong>
              </div>
              <div className="text-right">
                <span className="block text-[11px] text-muted-foreground">Ocorrências</span>
                <strong className="text-sm tabular-nums">{occurrences}</strong>
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="hidden min-w-0 md:block">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-24" />
            <col />
            <col />
            <col className="w-20" />
            <col className="w-28" />
            <col className="w-28" />
          </colgroup>
          <thead className="whitespace-nowrap bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="whitespace-nowrap px-2.5 py-2">Data</th>
              <th className="px-2.5 py-2">Descrição</th>
              <th className="px-2.5 py-2">Categoria</th>
              <th className="whitespace-nowrap px-2.5 py-2">Tipo</th>
              <th className="whitespace-nowrap px-2.5 py-2 text-right">Valor</th>
              <th className="break-words px-2.5 py-2 text-right">Ocorrências</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ fingerprint, transaction, occurrences }) => (
              <tr key={fingerprint} className="border-t border-border">
                <td className="whitespace-nowrap px-2.5 py-2 align-top">
                  {formatCalendarDate(transaction.date)}
                </td>
                <td className="break-words px-2.5 py-2 align-top">{transaction.description}</td>
                <td className="break-words px-2.5 py-2 align-top">{transaction.category}</td>
                <td className="whitespace-nowrap px-2.5 py-2 align-top capitalize">
                  {transaction.type}
                </td>
                <td className="whitespace-nowrap px-2.5 py-2 text-right align-top tabular-nums">
                  {brl(transaction.amount)}
                </td>
                <td className="whitespace-nowrap px-2.5 py-2 text-right align-top font-medium tabular-nums">
                  {occurrences}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
