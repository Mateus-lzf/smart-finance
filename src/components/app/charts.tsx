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
} from "recharts";
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
};

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
