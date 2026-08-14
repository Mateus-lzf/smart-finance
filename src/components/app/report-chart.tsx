import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReportMonth } from "@/lib/report-types";
import { brl } from "@/lib/mock-data";

const compactBrl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

function printValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? compactBrl.format(value) : "";
}

export function ReportChart({ data }: { data: ReportMonth[] }) {
  if (!data.length)
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        Não há meses com lançamentos neste recorte.
      </p>
    );
  const activityCount = data.filter((month) => month.hasActivity).length;
  const singleMonth = activityCount === 1;
  const chartData = data.map((month) => {
    const revenue = month.revenue ?? 0;
    const expenses = month.expenses ?? 0;
    const largest = Math.max(revenue, expenses);
    const valuesAreClose =
      activityCount > 8 &&
      month.hasActivity &&
      largest > 0 &&
      Math.abs(revenue - expenses) / largest < 0.05;
    return {
      ...month,
      printRevenue: valuesAreClose && revenue < expenses ? null : month.revenue,
      printExpenses: valuesAreClose && expenses < revenue ? null : month.expenses,
      positiveResult: month.result !== null && month.result >= 0 ? month.result : null,
      negativeResult: month.result !== null && month.result < 0 ? month.result : null,
    };
  });
  return (
    <ResponsiveContainer width="100%" height={280} className="report-chart">
      <ComposedChart data={chartData} margin={{ left: -4, right: 8, top: 12 }}>
        <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: number) => brl(value, true)}
          width={76}
        />
        <Tooltip
          contentStyle={{
            background: "var(--color-popover)",
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            fontSize: 12,
          }}
          formatter={(value: number) => brl(value)}
        />
        <Legend
          verticalAlign="top"
          height={32}
          iconType="circle"
          payload={[
            { value: "Receitas", type: "circle", color: "var(--color-chart-1)" },
            { value: "Despesas", type: "circle", color: "var(--color-chart-4)" },
            { value: "Resultado", type: "circle", color: "var(--color-chart-3)" },
          ]}
        />
        <ReferenceLine y={0} stroke="var(--color-muted-foreground)" strokeOpacity={0.45} />
        <Bar
          dataKey="revenue"
          name="Receitas"
          fill="var(--color-chart-1)"
          radius={[5, 5, 0, 0]}
          maxBarSize={24}
        >
          <LabelList
            dataKey="printRevenue"
            position="top"
            formatter={printValue}
            className="report-print-chart-label"
          />
        </Bar>
        <Bar
          dataKey="expenses"
          name="Despesas"
          fill="var(--color-chart-4)"
          radius={[5, 5, 0, 0]}
          maxBarSize={24}
        >
          <LabelList
            dataKey="printExpenses"
            position="insideTop"
            formatter={printValue}
            className="report-print-chart-label report-print-chart-label-expense"
          />
        </Bar>
        <Line
          dataKey="positiveResult"
          name="Resultado"
          stroke="var(--color-chart-3)"
          strokeWidth={singleMonth ? 0 : 2}
          dot={{ r: singleMonth ? 5 : 2, fill: "var(--color-chart-3)" }}
          connectNulls={false}
        >
          <LabelList
            dataKey="positiveResult"
            position="top"
            offset={10}
            formatter={printValue}
            className="report-print-chart-label report-print-chart-label-result"
          />
        </Line>
        <Line
          dataKey="negativeResult"
          name="Resultado"
          legendType="none"
          stroke="var(--color-chart-4)"
          strokeWidth={singleMonth ? 0 : 2}
          dot={{ r: singleMonth ? 5 : 2, fill: "var(--color-chart-4)" }}
          connectNulls={false}
        >
          <LabelList
            dataKey="negativeResult"
            position="bottom"
            offset={10}
            formatter={printValue}
            className="report-print-chart-label report-print-chart-label-negative"
          />
        </Line>
      </ComposedChart>
    </ResponsiveContainer>
  );
}
