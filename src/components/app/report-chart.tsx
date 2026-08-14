import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReportMonth } from "@/lib/report-types";
import { brl } from "@/lib/mock-data";

export function ReportChart({ data }: { data: ReportMonth[] }) {
  if (!data.length)
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        Não há meses com lançamentos neste recorte.
      </p>
    );
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ left: -4, right: 8, top: 12 }}>
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
        <Bar
          dataKey="revenue"
          name="Receitas"
          fill="var(--color-chart-1)"
          radius={[5, 5, 0, 0]}
          maxBarSize={24}
        />
        <Bar
          dataKey="expenses"
          name="Despesas"
          fill="var(--color-chart-4)"
          radius={[5, 5, 0, 0]}
          maxBarSize={24}
        />
        <Line
          dataKey="result"
          name="Resultado"
          stroke="var(--color-chart-3)"
          strokeWidth={2}
          dot={{ r: 2 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
