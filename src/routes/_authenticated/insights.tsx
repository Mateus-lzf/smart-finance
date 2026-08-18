import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, Check, Lightbulb, SlidersHorizontal } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { InsightCard } from "@/components/app/insight-card";
import { ProjectEmptyState } from "@/components/app/project-empty-state";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { productTitle } from "@/lib/product-config";
import { analyzeInsights } from "@/lib/insight-service";
import { useApp } from "@/lib/app-store";

export const Route = createFileRoute("/_authenticated/insights")({
  head: () => ({ meta: [{ title: productTitle("Insights financeiros") }] }),
  component: InsightsPage,
});

function InsightsPage() {
  const { project, transactions, importProfile, analyticDimensions, setAnalyticDimensions } =
    useApp();
  if (!project) {
    return (
      <AppShell title="Insights" description="Selecione ou crie um projeto para continuar">
        <ProjectEmptyState />
      </AppShell>
    );
  }

  const mappedColumns = new Set(Object.values(importProfile?.mapping ?? {}));
  const additionalColumns = (importProfile?.columns ?? []).filter(
    (column) => !mappedColumns.has(column.id),
  );
  const selectedDimensions = analyticDimensions.slice(0, 3);
  const analysis = analyzeInsights(transactions, {
    selectedDimensionIds: selectedDimensions,
    columns: additionalColumns,
  });
  const toggleDimension = (id: string, checked: boolean) => {
    if (checked && selectedDimensions.length >= 3) return;
    setAnalyticDimensions(
      checked
        ? [...selectedDimensions, id]
        : selectedDimensions.filter((columnId) => columnId !== id),
    );
  };

  return (
    <AppShell title="Insights" description={`Análises financeiras de ${project.name}`}>
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">
              Principais informações encontradas nos lançamentos registrados.
            </p>
            {analysis.context.analyzedPeriod && (
              <p className="mt-1 text-xs text-muted-foreground">
                Período principal: {analysis.context.analyzedPeriod}
              </p>
            )}
          </div>
          {additionalColumns.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <SlidersHorizontal className="size-3.5" /> Dimensões analíticas
                  {selectedDimensions.length > 0 && (
                    <span className="rounded-full bg-accent px-1.5 text-xs text-accent-foreground">
                      {selectedDimensions.length}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-80 w-72 overflow-y-auto">
                <DropdownMenuLabel>Colunas adicionais</DropdownMenuLabel>
                <p className="px-2 pb-2 text-xs leading-relaxed text-muted-foreground">
                  Selecione até 3 colunas para analisar separadamente. Essas análises aparecerão
                  além dos principais insights.
                </p>
                <DropdownMenuSeparator />
                {additionalColumns.map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={selectedDimensions.includes(column.id)}
                    disabled={
                      selectedDimensions.length >= 3 && !selectedDimensions.includes(column.id)
                    }
                    onCheckedChange={(checked) => toggleDimension(column.id, Boolean(checked))}
                  >
                    {column.header}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {analysis.state === "no-transactions" ? (
          <InsightState
            icon={BarChart3}
            title="Ainda não há dados para analisar"
            body="Os insights são calculados a partir dos lançamentos do projeto. Importe uma planilha ou adicione lançamentos para iniciar a análise."
          />
        ) : analysis.insights.length > 0 ? (
          <>
            <section className="space-y-3">
              <h2 className="text-base font-medium">Principais insights</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {analysis.insights.map((item, index) => (
                  <InsightCard key={item.id} insight={item} index={index} />
                ))}
              </div>
            </section>
            {analysis.state === "temporal-data-insufficient" && (
              <p className="surface flex items-start gap-2 p-4 text-sm text-muted-foreground">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" />
                Já é possível entender a composição dos dados, mas os meses disponíveis ainda não
                possuem períodos equivalentes e amostra suficiente para uma comparação segura.
              </p>
            )}
            {!analysis.context.hasComparablePeriod && (
              <p className="surface flex items-start gap-2 p-4 text-sm text-muted-foreground">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" />
                Os insights atuais descrevem somente o período disponível. Comparações poderão
                aparecer quando houver dados suficientes em um mês consecutivo.
              </p>
            )}
          </>
        ) : analysis.state === "no-material-findings" ? (
          <InsightState
            icon={Check}
            title="Nenhuma mudança relevante foi encontrada"
            body="Os lançamentos foram analisados, mas nenhuma mudança ou concentração atingiu os critérios mínimos para ser destacada."
          />
        ) : (
          <InsightState
            icon={Lightbulb}
            title="Ainda há poucos dados para destacar informações"
            body="O projeto possui lançamentos, mas a quantidade ou variedade atual ainda é pequena para apresentar uma observação confiável."
          />
        )}

        {analysis.dimensionAnalyses.length > 0 && (
          <section className="space-y-3">
            <div>
              <h2 className="text-base font-medium">Análises por dimensão</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Resultados das colunas que você selecionou para analisar separadamente.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {analysis.dimensionAnalyses.map((item, index) =>
                item.insight ? (
                  <InsightCard key={item.columnId} insight={item.insight} index={index} />
                ) : (
                  <div key={item.columnId} className="surface p-5">
                    <p className="text-sm font-medium">{item.columnLabel}</p>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {item.message}
                    </p>
                  </div>
                ),
              )}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}

function InsightState({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Lightbulb;
  title: string;
  body: string;
}) {
  return (
    <div className="surface flex flex-col items-center px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-xl bg-accent text-accent-foreground">
        <Icon className="size-5" />
      </span>
      <h2 className="mt-5 text-lg font-medium">{title}</h2>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
