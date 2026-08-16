import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
  Legend,
} from "recharts";
import type { DashboardCategory, DashboardMonth } from "@/lib/dashboard-types";
import { useApp } from "@/lib/app-store";
import { brl } from "@/lib/mock-data";
import {
  expenseCategoriesFromTransactions,
  monthlySeriesFromTransactions,
  weekdayRevenueFromTransactions,
} from "@/lib/finance-service";

const palette = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-muted-foreground)",
];

const axis = {
  stroke: "var(--color-border)",
  tick: { fill: "var(--color-muted-foreground)", fontSize: 11 },
  tickLine: false,
  axisLine: false,
};

const tooltipStyle = {
  contentStyle: {
    background: "var(--color-popover)",
    border: "1px solid var(--color-border)",
    borderRadius: 12,
    fontSize: 12,
    boxShadow: "var(--shadow-soft)",
    color: "var(--color-popover-foreground)",
  },
  labelStyle: { color: "var(--color-muted-foreground)", marginBottom: 4 },
  itemStyle: { color: "var(--color-popover-foreground)" },
};

function DashboardMonthlyBars({
  data,
  metric,
  label,
  color,
  emptyLabel,
  height = 200,
}: {
  data: DashboardMonth[];
  metric: "revenue" | "expenses";
  label: string;
  color: string;
  emptyLabel: string;
  height?: number;
}) {
  const hasValues = data.some((item) => item[metric] !== null && item[metric] !== 0);
  if (!hasValues)
    return (
      <div className="grid min-h-[200px] place-items-center px-4 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: -6, right: 8, top: 10, bottom: 2 }}>
        <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
        <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={20} />
        <YAxis {...axis} tickFormatter={(value: number) => brl(value, true)} width={74} />
        <Tooltip
          {...tooltipStyle}
          formatter={(value: number) => [brl(value), label]}
          cursor={{ fill: "var(--color-muted)" }}
        />
        <Bar dataKey={metric} name={label} fill={color} radius={[5, 5, 0, 0]} maxBarSize={30} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DashboardRevenueBars({ data }: { data: DashboardMonth[] }) {
  return (
    <DashboardMonthlyBars
      data={data}
      metric="revenue"
      label="Receitas"
      color="var(--color-chart-1)"
      emptyLabel="Não há receitas registradas no histórico exibido."
    />
  );
}

export function DashboardExpenseBars({ data }: { data: DashboardMonth[] }) {
  return (
    <DashboardMonthlyBars
      data={data}
      metric="expenses"
      label="Despesas"
      color="var(--color-chart-4)"
      emptyLabel="Não há despesas registradas no histórico exibido."
    />
  );
}

export function DashboardEvolutionChart({
  data,
  height = 280,
}: {
  data: DashboardMonth[];
  height?: number;
}) {
  const activeCount = data.filter((item) => item.hasActivity).length;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: -6, right: 10, top: 12, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
        <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={22} />
        <YAxis {...axis} tickFormatter={(v: number) => brl(v, true)} width={74} />
        <Tooltip
          {...tooltipStyle}
          formatter={(value: number, name: string) => [
            brl(value),
            name === "revenue" ? "Receitas" : name === "expenses" ? "Despesas" : "Resultado",
          ]}
        />
        <Legend
          formatter={(value) =>
            value === "revenue" ? "Receitas" : value === "expenses" ? "Despesas" : "Resultado"
          }
          wrapperStyle={{ fontSize: 12 }}
        />
        <Line
          type="monotone"
          dataKey="revenue"
          stroke="var(--color-chart-1)"
          strokeWidth={2}
          dot={activeCount === 1 ? { r: 4 } : false}
          connectNulls={false}
        />
        <Line
          type="monotone"
          dataKey="expenses"
          stroke="var(--color-chart-4)"
          strokeWidth={2}
          dot={activeCount === 1 ? { r: 4 } : false}
          connectNulls={false}
        />
        <Line
          type="monotone"
          dataKey="result"
          stroke="var(--color-chart-3)"
          strokeWidth={2}
          dot={activeCount === 1 ? { r: 4 } : false}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DashboardExpenseCategories({
  data,
  height = 132,
}: {
  data: DashboardCategory[];
  height?: number;
}) {
  if (!data.length)
    return (
      <div className="grid min-h-[230px] place-items-center px-4 text-center text-sm text-muted-foreground">
        Não há despesas registradas neste período.
      </div>
    );
  return (
    <div className="grid min-h-[230px] grid-cols-[104px_minmax(0,1fr)] items-center gap-3">
      <div className="w-full">
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={data}
              dataKey="amount"
              nameKey="name"
              innerRadius="58%"
              outerRadius="86%"
              paddingAngle={2}
              stroke="none"
            >
              {data.map((_, index) => (
                <Cell key={index} fill={palette[index % palette.length]} />
              ))}
            </Pie>
            <Tooltip {...tooltipStyle} formatter={(value: number) => brl(value)} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-0 space-y-1.5">
        {data.map((category, index) => (
          <li key={category.name} className="flex min-w-0 items-center gap-1.5 text-xs">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: palette[index % palette.length] }}
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground" title={category.name}>
              {category.name}
            </span>
            <span className="shrink-0 text-right">
              <span className="tabular block font-medium">{category.share.toFixed(1)}%</span>
              <span className="tabular block text-[10px] text-muted-foreground">
                {brl(category.amount, true)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RevenueBars({ height = 260 }: { height?: number }) {
  const { transactions } = useApp();
  const data = monthlySeriesFromTransactions(transactions);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: -6, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
        <XAxis dataKey="month" {...axis} />
        <YAxis {...axis} tickFormatter={(v: number) => brl(v, true)} width={74} />
        <Tooltip
          {...tooltipStyle}
          formatter={(v: number) => brl(v)}
          cursor={{ fill: "var(--color-muted)" }}
        />
        <Bar dataKey="receita" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ExpenseBars({ height = 260 }: { height?: number }) {
  const { transactions } = useApp();
  const data = monthlySeriesFromTransactions(transactions);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: -6, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
        <XAxis dataKey="month" {...axis} />
        <YAxis {...axis} tickFormatter={(v: number) => brl(v, true)} width={74} />
        <Tooltip
          {...tooltipStyle}
          formatter={(v: number) => brl(v)}
          cursor={{ fill: "var(--color-muted)" }}
        />
        <Bar dataKey="despesa" fill="var(--color-chart-4)" radius={[6, 6, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CashFlowArea({ height = 260 }: { height?: number }) {
  const { transactions } = useApp();
  const data = monthlySeriesFromTransactions(transactions);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ left: -6, right: 4, top: 8 }}>
        <defs>
          <linearGradient id="cash" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
        <XAxis dataKey="month" {...axis} />
        <YAxis {...axis} tickFormatter={(v: number) => brl(v, true)} width={74} />
        <Tooltip {...tooltipStyle} formatter={(v: number) => brl(v)} />
        <Area
          type="monotone"
          dataKey="saldo"
          stroke="var(--color-chart-1)"
          strokeWidth={2}
          fill="url(#cash)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ProfitLine({ height = 260 }: { height?: number }) {
  const { transactions } = useApp();
  const data = monthlySeriesFromTransactions(transactions);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: -6, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
        <XAxis dataKey="month" {...axis} />
        <YAxis {...axis} tickFormatter={(v: number) => brl(v, true)} width={74} />
        <Tooltip {...tooltipStyle} formatter={(v: number) => brl(v)} />
        <Line
          type="monotone"
          dataKey="receita"
          stroke="var(--color-chart-1)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="despesa"
          stroke="var(--color-chart-4)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="lucro"
          stroke="var(--color-chart-3)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CategoryDonut({ height = 260 }: { height?: number }) {
  const { transactions } = useApp();
  const data = expenseCategoriesFromTransactions(transactions);
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="w-full sm:w-1/2">
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="58%"
              outerRadius="86%"
              paddingAngle={2}
              stroke="none"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={palette[i % palette.length]} />
              ))}
            </Pie>
            <Tooltip {...tooltipStyle} formatter={(v: number) => `${v.toFixed(1)}%`} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex-1 space-y-2">
        {data.map((c, i) => (
          <li key={c.name} className="flex items-center gap-2 text-sm">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: palette[i % palette.length] }}
            />
            <span className="flex-1 truncate text-muted-foreground">{c.name}</span>
            <span className="tabular font-medium">{c.value.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WeekdayBars({ height = 180 }: { height?: number }) {
  const { transactions } = useApp();
  const data = weekdayRevenueFromTransactions(transactions);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: -10, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
        <XAxis dataKey="day" {...axis} />
        <YAxis {...axis} tickFormatter={(v: number) => brl(v, true)} width={70} />
        <Tooltip
          {...tooltipStyle}
          formatter={(v: number) => brl(v)}
          cursor={{ fill: "var(--color-muted)" }}
        />
        <Bar dataKey="receita" fill="var(--color-chart-2)" radius={[6, 6, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ResponsiveContainer>
  );
}
