import type { Transaction } from "@/lib/finance-types";
import type { DashboardPeriodSummary } from "@/lib/dashboard-types";
import { formatCalendarDate } from "@/lib/calendar-date";
import { brl } from "@/lib/mock-data";

function LargestTransaction({
  label,
  transaction,
  emptyLabel,
}: {
  label: string;
  transaction: Transaction | null;
  emptyLabel: string;
}) {
  return (
    <div className="min-w-0 px-4 py-1 first:pl-0 last:pr-0">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      {transaction ? (
        <>
          <p className="tabular mt-1 text-lg font-semibold">{brl(Math.abs(transaction.amount))}</p>
          <p
            className="mt-0.5 truncate text-xs text-muted-foreground"
            title={transaction.description}
          >
            {transaction.description} · {formatCalendarDate(transaction.date)}
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{emptyLabel}</p>
      )}
    </div>
  );
}

export function DashboardPeriodSummaryView({ summary }: { summary: DashboardPeriodSummary }) {
  return (
    <div className="grid gap-y-4 divide-y divide-border/70 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      <LargestTransaction
        label="Maior receita registrada"
        transaction={summary.largestRevenue}
        emptyLabel="Nenhuma receita registrada"
      />
      <LargestTransaction
        label="Maior despesa registrada"
        transaction={summary.largestExpense}
        emptyLabel="Nenhuma despesa registrada"
      />
      <div className="px-4 py-1 first:pl-0 last:pr-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Lançamentos por tipo
        </p>
        <p className="mt-1 text-lg font-semibold">
          {summary.revenueCount + summary.expenseCount} no período
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {summary.revenueCount} {summary.revenueCount === 1 ? "receita" : "receitas"} ·{" "}
          {summary.expenseCount} {summary.expenseCount === 1 ? "despesa" : "despesas"}
        </p>
      </div>
    </div>
  );
}
