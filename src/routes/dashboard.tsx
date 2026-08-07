import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/app-shell";
import { KpiCard } from "@/components/app/kpi-card";
import { Panel } from "@/components/app/panel";
import { ProjectEmptyState } from "@/components/app/project-empty-state";
import {
  CashFlowArea,
  CategoryDonut,
  ExpenseBars,
  ProfitLine,
  RevenueBars,
  WeekdayBars,
} from "@/components/app/charts";
import { useApp } from "@/lib/app-store";
import { kpisFromTransactions } from "@/lib/finance-service";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard financeiro — Clareza" },
      {
        name: "description",
        content:
          "Receita, despesas, lucro e fluxo de caixa calculados a partir dos seus lançamentos.",
      },
      { property: "og:title", content: "Dashboard financeiro — Clareza" },
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
  const { project, transactions } = useApp();
  if (!project) {
    return (
      <AppShell title="Dashboard" description="Selecione ou crie um projeto para continuar">
        <ProjectEmptyState />
      </AppShell>
    );
  }
  const k = kpisFromTransactions(transactions);

  return (
    <AppShell
      title="Dashboard"
      description={`${project.name} · atualizado ${new Date(project.updatedAt).toLocaleDateString("pt-BR")}`}
    >
      <div className="grid gap-5">
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Receita"
              value={k.receita.value}
              delta={k.receita.delta}
              hint="vs. mês anterior"
            />
            <KpiCard
              label="Despesas"
              value={k.despesa.value}
              delta={k.despesa.delta}
              positiveIsGood={false}
              hint="vs. mês anterior"
            />
            <KpiCard
              label="Lucro"
              value={k.lucro.value}
              delta={k.lucro.delta}
              hint="margem saudável"
            />
            <KpiCard
              label="Saldo em caixa"
              value={k.saldo.value}
              delta={k.saldo.delta}
              hint="saldo acumulado"
            />
          </div>

          <Panel title="Evolução mensal" subtitle="Receita, despesas e lucro nos últimos 12 meses">
            <ProfitLine />
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Receita por mês">
              <RevenueBars height={220} />
            </Panel>
            <Panel title="Despesas por mês">
              <ExpenseBars height={220} />
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Fluxo de caixa" subtitle="Saldo acumulado">
              <CashFlowArea height={220} />
            </Panel>
            <Panel title="Categorias de despesa">
              <CategoryDonut height={200} />
            </Panel>
          </div>

          <Panel title="Receita por dia da semana" subtitle="Onde estão seus melhores dias">
            <WeekdayBars />
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
