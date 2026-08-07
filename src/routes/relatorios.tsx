import { createFileRoute } from "@tanstack/react-router";
import { CalendarRange, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { ProjectEmptyState } from "@/components/app/project-empty-state";
import { Panel } from "@/components/app/panel";
import { useApp } from "@/lib/app-store";
import { brl } from "@/lib/mock-data";
import { kpisFromTransactions, monthlySeriesFromTransactions } from "@/lib/finance-service";

export const Route = createFileRoute("/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios financeiros — Clareza" },
      {
        name: "description",
        content: "Resumos financeiros calculados a partir dos lançamentos do projeto.",
      },
      { property: "og:title", content: "Relatórios financeiros — Clareza" },
      { property: "og:description", content: "Relatórios prontos, escritos em linguagem simples." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RelatoriosPage,
});

const reports = [
  {
    icon: CalendarRange,
    title: "Resumo Mensal",
    desc: "Visão consolidada de receitas, despesas, lucro e saldo.",
  },
  {
    icon: CalendarRange,
    title: "Resumo Semanal",
    desc: "Lançamentos registrados nos últimos sete dias.",
  },
  {
    icon: Wallet,
    title: "Fluxo de Caixa",
    desc: "Entradas, saídas e saldo acumulado do período.",
  },
  {
    icon: TrendingUp,
    title: "Receitas",
    desc: "Receitas registradas no projeto.",
  },
  {
    icon: TrendingDown,
    title: "Despesas",
    desc: "Todas as saídas agrupadas por categoria e fornecedor.",
  },
];

function RelatoriosPage() {
  const { project, transactions } = useApp();
  if (!project) {
    return (
      <AppShell title="Relatórios" description="Selecione ou crie um projeto para continuar">
        <ProjectEmptyState />
      </AppShell>
    );
  }
  const k = kpisFromTransactions(transactions);
  const s = monthlySeriesFromTransactions(transactions);
  const cur = s[s.length - 1] ?? { month: "Sem dados" };

  return (
    <AppShell
      title="Relatórios"
      description={`Prontos para enviar ao contador ou ao sócio · ${project.name}`}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {reports.map((r) => (
            <article
              key={r.title}
              className="surface flex flex-wrap items-center gap-4 p-5 transition-shadow hover:shadow-lift"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
                <r.icon className="size-4.5" />
              </span>
              <div className="min-w-[180px] flex-1">
                <h2 className="text-[15px] font-medium">{r.title}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{r.desc}</p>
                <p className="mt-1 text-xs text-muted-foreground">{cur.month}</p>
              </div>
            </article>
          ))}
        </div>

        <Panel title="Prévia do resumo mensal" subtitle={`${cur.month} · ${project.name}`}>
          <dl className="space-y-3 text-sm">
            {[
              ["Receita", brl(k.receita.value)],
              ["Despesas", brl(k.despesa.value)],
              ["Lucro", brl(k.lucro.value)],
              [
                "Margem",
                k.receita.value
                  ? `${((k.lucro.value / k.receita.value) * 100).toFixed(1)}%`
                  : "0,0%",
              ],
              ["Saldo em caixa", brl(k.saldo.value)],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between border-b border-border pb-2 last:border-0"
              >
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="tabular font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 rounded-xl bg-muted/60 p-3 text-sm leading-relaxed text-muted-foreground">
            Resumo calculado a partir de {transactions.length} lançamento
            {transactions.length === 1 ? "" : "s"} deste projeto.
          </p>
        </Panel>
      </div>
    </AppShell>
  );
}
