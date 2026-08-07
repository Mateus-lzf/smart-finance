import type { PossibleDuplicateGroup } from "@/lib/finance-types";
import { formatCalendarDate } from "@/lib/calendar-date";
import { brl } from "@/lib/mock-data";

export function PossibleDuplicates({ groups }: { groups: PossibleDuplicateGroup[] }) {
  if (!groups.length) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-warning/30">
      <div className="bg-warning/10 px-3 py-2 text-sm">
        <strong>Possíveis duplicatas</strong>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Todas as ocorrências abaixo serão preservadas por padrão.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[650px] text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Descrição</th>
              <th className="px-3 py-2">Categoria</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2 text-right">Ocorrências</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ fingerprint, transaction, occurrences }) => (
              <tr key={fingerprint} className="border-t border-border">
                <td className="px-3 py-2">{formatCalendarDate(transaction.date)}</td>
                <td className="px-3 py-2">{transaction.description}</td>
                <td className="px-3 py-2">{transaction.category}</td>
                <td className="px-3 py-2 capitalize">{transaction.type}</td>
                <td className="px-3 py-2 text-right tabular-nums">{brl(transaction.amount)}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{occurrences}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
