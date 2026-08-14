import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CalendarRange, FilterX } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { Panel } from "@/components/app/panel";
import { ProjectEmptyState } from "@/components/app/project-empty-state";
import { ReportChart } from "@/components/app/report-chart";
import { ReportTable } from "@/components/app/report-table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useApp } from "@/lib/app-store";
import { brl } from "@/lib/mock-data";
import { productTitle } from "@/lib/product-config";
import {
  buildFinancialReport,
  EMPTY_CATEGORY,
  getLastTwelveMonthsRange,
  getLatestMonthRange,
  getReportCategories,
  getReportDateBounds,
  getReportDimensionValues,
} from "@/lib/report-service";
import type { ReportFilters, ReportGrouping, ReportTypeFilter } from "@/lib/report-types";

export const Route = createFileRoute("/relatorios")({
  head: () => ({ meta: [{ title: productTitle("Relatórios financeiros") }] }),
  component: RelatoriosPage,
});

function RelatoriosPage() {
  const { project, transactions, importProfile } = useApp();
  const bounds = useMemo(() => getReportDateBounds(transactions), [transactions]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [type, setType] = useState<ReportTypeFilter>("all");
  const [categories, setCategories] = useState<string[]>([]);
  const [dimensionColumnId, setDimensionColumnId] = useState("");
  const [dimensionValueKeys, setDimensionValueKeys] = useState<string[]>([]);
  const [grouping, setGrouping] = useState<ReportGrouping>({ type: "category" });

  if (!project)
    return (
      <AppShell title="Relatórios" description="Selecione ou crie um projeto para continuar">
        <ProjectEmptyState />
      </AppShell>
    );
  if (!transactions.length)
    return (
      <AppShell title="Relatórios" description={`Consulta financeira de ${project.name}`}>
        <EmptyState
          title="Este projeto ainda não possui lançamentos"
          body="Importe uma planilha ou adicione lançamentos para criar um relatório."
        />
      </AppShell>
    );

  const mappedColumns = new Set(Object.values(importProfile?.mapping ?? {}));
  const additionalColumns = (importProfile?.columns ?? []).filter(
    (column) => !mappedColumns.has(column.id),
  );
  const effectiveStart = startDate || bounds.startDate;
  const effectiveEnd = endDate || bounds.endDate;
  const availableCategories = getReportCategories(transactions);
  const dimensionValues = dimensionColumnId
    ? getReportDimensionValues(transactions, dimensionColumnId)
    : [];
  const filters: ReportFilters = {
    startDate: effectiveStart,
    endDate: effectiveEnd,
    type,
    categories,
    ...(dimensionColumnId ? { dimensionColumnId } : {}),
    dimensionValueKeys,
    grouping,
  };
  const report = buildFinancialReport(transactions, filters, { columns: additionalColumns });
  const reset = () => {
    setStartDate(bounds.startDate);
    setEndDate(bounds.endDate);
    setType("all");
    setCategories([]);
    setDimensionColumnId("");
    setDimensionValueKeys([]);
    setGrouping({ type: "category" });
  };
  const setRange = (range: { startDate: string; endDate: string }) => {
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  };
  const groupingLabel =
    grouping.type === "category"
      ? "Categoria"
      : grouping.type === "month"
        ? "Mês"
        : (additionalColumns.find((column) => column.id === grouping.columnId)?.header ??
          "Categoria");

  return (
    <AppShell title="Relatórios" description={`Consulta financeira de ${project.name}`}>
      <div className="space-y-5">
        <section className="surface space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium">Filtros do relatório</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Escolha o período e o recorte que deseja consultar.
              </p>
            </div>
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={reset}>
              <FilterX className="size-3.5" /> Limpar filtros
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Field label="Data inicial">
              <input
                type="date"
                value={effectiveStart}
                onChange={(event) => setStartDate(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </Field>
            <Field label="Data final">
              <input
                type="date"
                value={effectiveEnd}
                onChange={(event) => setEndDate(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </Field>
            <Field label="Tipo">
              <select
                value={type}
                onChange={(event) => setType(event.target.value as ReportTypeFilter)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">Todos</option>
                <option value="receita">Receitas</option>
                <option value="despesa">Despesas</option>
              </select>
            </Field>
            <Field label="Categorias">
              <MultiSelect
                label={categories.length ? `${categories.length} selecionada(s)` : "Todas"}
                items={availableCategories.map((key) => ({
                  key,
                  label: key === EMPTY_CATEGORY ? "Sem categoria" : key,
                }))}
                selected={categories}
                onChange={setCategories}
              />
            </Field>
            <Field label="Agrupar por">
              <select
                value={
                  grouping.type === "dimension" ? `dimension:${grouping.columnId}` : grouping.type
                }
                onChange={(event) => {
                  const value = event.target.value;
                  setGrouping(
                    value.startsWith("dimension:")
                      ? { type: "dimension", columnId: value.slice(10) }
                      : { type: value as "category" | "month" },
                  );
                }}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="category">Categoria</option>
                <option value="month">Mês</option>
                {additionalColumns.map((column) => (
                  <option key={column.id} value={`dimension:${column.id}`}>
                    {column.header}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setRange(bounds)}>
              Todo o período
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRange(getLatestMonthRange(transactions))}
            >
              Mês mais recente
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRange(getLastTwelveMonthsRange(transactions))}
            >
              Últimos 12 meses
            </Button>
          </div>
          {additionalColumns.length > 0 && (
            <div className="grid gap-3 border-t border-border pt-4 md:grid-cols-2">
              <Field label="Filtro adicional">
                <select
                  value={dimensionColumnId}
                  onChange={(event) => {
                    setDimensionColumnId(event.target.value);
                    setDimensionValueKeys([]);
                  }}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Nenhum</option>
                  {additionalColumns.map((column) => (
                    <option key={column.id} value={column.id}>
                      {column.header}
                    </option>
                  ))}
                </select>
              </Field>
              {dimensionColumnId && (
                <Field label="Valores">
                  <MultiSelect
                    label={
                      dimensionValueKeys.length
                        ? `${dimensionValueKeys.length} selecionado(s)`
                        : "Todos"
                    }
                    items={dimensionValues.map(({ key, label }) => ({ key, label }))}
                    selected={dimensionValueKeys}
                    onChange={setDimensionValueKeys}
                  />
                </Field>
              )}
            </div>
          )}
        </section>

        {report.invalidRange && (
          <Notice>
            O intervalo é inválido. A data inicial deve ser anterior ou igual à data final.
          </Notice>
        )}
        {report.invalidDateCount > 0 && (
          <Notice>
            {report.invalidDateCount} lançamento
            {report.invalidDateCount === 1 ? " foi ignorado" : "s foram ignorados"} porque{" "}
            {report.invalidDateCount === 1 ? "possui" : "possuem"} data inválida.
          </Notice>
        )}

        {!report.invalidRange && !report.transactions.length ? (
          <EmptyState
            title="Nenhum lançamento neste recorte"
            body="Revise o período ou remova alguns filtros para consultar outros lançamentos."
          />
        ) : (
          !report.invalidRange && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <Metric label="Receitas" value={brl(report.summary.revenue)} />
                <Metric label="Despesas" value={brl(report.summary.expenses)} />
                <Metric label="Resultado" value={brl(report.summary.result)} />
                <Metric
                  label="Margem"
                  value={
                    report.summary.margin === null
                      ? "Não aplicável"
                      : `${report.summary.margin.toFixed(1).replace(".", ",")}%`
                  }
                />
                <Metric label="Lançamentos" value={String(report.summary.transactionCount)} />
              </div>
              <Panel title="Evolução mensal" subtitle="Receitas, despesas e resultado do recorte">
                <ReportChart data={report.months} />
              </Panel>
              <Panel
                title={`Composição por ${groupingLabel}`}
                subtitle="Participação sobre a movimentação financeira do recorte"
              >
                {report.dimensionCoverage && report.dimensionCoverage.percentage < 100 && (
                  <p className="mb-3 rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">
                    A informação de {report.dimensionCoverage.header} está preenchida em{" "}
                    {report.dimensionCoverage.percentage.toFixed(1).replace(".", ",")}% dos
                    lançamentos deste recorte.
                  </p>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 text-left">{groupingLabel}</th>
                        <th className="px-3 py-2 text-right">Lançamentos</th>
                        <th className="px-3 py-2 text-right">Receitas</th>
                        <th className="px-3 py-2 text-right">Despesas</th>
                        <th className="px-3 py-2 text-right">Resultado</th>
                        <th className="px-3 py-2 text-right">Participação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.groups.map((group) => (
                        <tr key={group.key} className="border-b border-border/70 last:border-0">
                          <td className="px-3 py-2.5">{group.label}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {group.transactionCount}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {brl(group.revenue)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {brl(group.expenses)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {brl(group.result)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {group.participation.toFixed(1).replace(".", ",")}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
              <Panel
                title="Lançamentos do relatório"
                subtitle="Registros que formam os totais apresentados"
              >
                <ReportTable
                  transactions={report.transactions}
                  additionalColumns={additionalColumns}
                />
              </Panel>
            </>
          )
        )}
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5">
      <span className="block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
function MultiSelect({
  label,
  items,
  selected,
  onChange,
}: {
  label: string;
  items: { key: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full justify-start font-normal">
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-72 w-64 overflow-y-auto">
        <DropdownMenuLabel>Selecione uma ou mais opções</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map((item) => (
          <DropdownMenuCheckboxItem
            key={item.key}
            checked={selected.includes(item.key)}
            onCheckedChange={(checked) =>
              onChange(
                checked ? [...selected, item.key] : selected.filter((key) => key !== item.key),
              )
            }
          >
            {item.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="surface flex items-start gap-2 border-amber-500/30 p-4 text-sm text-muted-foreground">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
      {children}
    </p>
  );
}
function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="surface flex flex-col items-center px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-xl bg-accent text-accent-foreground">
        <CalendarRange className="size-5" />
      </span>
      <h2 className="mt-5 text-lg font-medium">{title}</h2>
      <p className="mt-2 max-w-lg text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
