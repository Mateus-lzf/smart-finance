import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileSpreadsheet, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import {
  DashboardEvolutionChart,
  DashboardExpenseBars,
  DashboardExpenseCategories,
  DashboardRevenueBars,
} from "@/components/app/charts";
import { DashboardPeriodSummaryView } from "@/components/app/dashboard-period-summary";
import { DashboardRecentTransactions } from "@/components/app/dashboard-recent-transactions";
import { KpiCard } from "@/components/app/kpi-card";
import { Panel } from "@/components/app/panel";
import { ProjectEmptyState } from "@/components/app/project-empty-state";
import { TransactionDialog } from "@/components/app/transaction-dialog";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/app-store";
import { buildDashboardAnalysis } from "@/lib/dashboard-service";
import { productTitle } from "@/lib/product-config";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: productTitle("Dashboard financeiro") },
      {
        name: "description",
        content: "Receitas, despesas e resultado calculados a partir dos lançamentos do projeto.",
      },
      { property: "og:title", content: productTitle("Dashboard financeiro") },
      {
        property: "og:description",
        content: "Indicadores financeiros atualizados a partir dos dados do seu projeto.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { project, transactions, addTransaction } = useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const analysis = useMemo(() => buildDashboardAnalysis(transactions), [transactions]);

  if (!project) {
    return (
      <AppShell title="Dashboard" description="Selecione ou crie um projeto para continuar">
        <ProjectEmptyState />
      </AppShell>
    );
  }

  if (analysis.state === "no-transactions") {
    return (
      <AppShell title="Dashboard" description={`Visão financeira de ${project.name}`}>
        <div className="surface mx-auto flex max-w-xl flex-col items-center px-6 py-14 text-center">
          <span className="grid size-12 place-items-center rounded-xl bg-accent text-accent-foreground">
            <FileSpreadsheet className="size-5" />
          </span>
          <h2 className="mt-5 text-lg font-medium">Este projeto ainda não possui lançamentos</h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            Importe uma planilha ou registre o primeiro lançamento para visualizar o resumo
            financeiro do projeto.
          </p>
          {analysis.invalidDateCount > 0 && (
            <p className="mt-3 text-xs text-destructive">
              {analysis.invalidDateCount === 1
                ? "1 lançamento não pôde ser analisado porque possui data inválida."
                : `${analysis.invalidDateCount} lançamentos não puderam ser analisados porque possuem datas inválidas.`}
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link to="/importar">
                <FileSpreadsheet className="size-4" /> Importar planilha
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Novo lançamento
            </Button>
          </div>
        </div>
        <TransactionDialog
          open={createOpen}
          transaction={null}
          onOpenChange={setCreateOpen}
          onCreate={(transaction) => {
            addTransaction(transaction);
            toast.success("Lançamento criado.");
          }}
          onUpdate={() => undefined}
        />
      </AppShell>
    );
  }

  const period = analysis.period!;
  return (
    <AppShell title="Dashboard" description={`Visão financeira de ${project.name}`}>
      <div className="grid gap-4">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{period.label}</span>
            {!period.isFullMonth && (
              <>
                <span aria-hidden="true">•</span>
                <span>Dados até {period.endDate.split("-").reverse().slice(0, 2).join("/")}</span>
              </>
            )}
            <span aria-hidden="true">•</span>
            <span>
              {analysis.transactionCount}{" "}
              {analysis.transactionCount === 1 ? "lançamento" : "lançamentos"}
            </span>
          </div>
          <Button variant="ghost" size="sm" asChild className="h-7 px-2 text-xs">
            <Link to="/relatorios">Consultar outros períodos</Link>
          </Button>
        </header>

        {analysis.invalidDateCount > 0 && (
          <div className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {analysis.invalidDateCount === 1
              ? "1 lançamento não foi incluído porque possui data inválida."
              : `${analysis.invalidDateCount} lançamentos não foram incluídos porque possuem datas inválidas.`}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Receitas"
            value={analysis.kpis.revenue.value}
            comparison={analysis.kpis.revenue.comparison}
          />
          <KpiCard
            label="Despesas"
            value={analysis.kpis.expenses.value}
            comparison={analysis.kpis.expenses.comparison}
            positiveIsGood={false}
          />
          <KpiCard
            label="Resultado"
            value={analysis.kpis.result.value}
            comparison={analysis.kpis.result.comparison}
          />
          <KpiCard
            label="Margem"
            value={analysis.kpis.margin.value}
            format="percentage"
            hint={
              analysis.kpis.margin.value === null
                ? "Sem receitas no período"
                : "Resultado sobre receitas"
            }
          />
        </div>

        <div className="grid items-stretch gap-4 lg:grid-cols-12">
          <Panel
            title="Evolução financeira"
            subtitle="Receitas, despesas e resultado nos últimos 12 meses civis"
            className="h-full lg:col-span-8"
          >
            <DashboardEvolutionChart data={analysis.months} height={230} />
          </Panel>

          <Panel
            title="Despesas por categoria"
            subtitle={period.label}
            className="h-full lg:col-span-4"
          >
            <DashboardExpenseCategories data={analysis.expenseCategories} />
          </Panel>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Receitas por mês" subtitle="Comparação mensal das receitas registradas">
            <DashboardRevenueBars data={analysis.months} />
          </Panel>
          <Panel title="Despesas por mês" subtitle="Comparação mensal das despesas registradas">
            <DashboardExpenseBars data={analysis.months} />
          </Panel>
        </div>

        <Panel title="Resumo do período" subtitle={period.label}>
          <DashboardPeriodSummaryView summary={analysis.periodSummary} />
        </Panel>

        <Panel
          title="Movimentações recentes"
          subtitle={`Últimos lançamentos de ${period.label.toLocaleLowerCase("pt-BR")}`}
        >
          <DashboardRecentTransactions rows={analysis.recentTransactions} />
        </Panel>
      </div>
    </AppShell>
  );
}
