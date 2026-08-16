import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { DashboardComparison } from "@/lib/dashboard-types";
import { brl } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const percent = (value: number) => `${Math.abs(value).toFixed(1).replace(".", ",")}%`;

function comparisonText(comparison: DashboardComparison, positiveIsGood: boolean) {
  if (comparison.state === "no-comparable-period")
    return { text: "Sem período anterior comparável", good: null, icon: Minus };
  if (comparison.state === "zero-base")
    return { text: "Sem base percentual no período anterior", good: null, icon: Minus };
  if (comparison.state === "absolute") {
    const direction =
      comparison.difference > 0 ? "Acima" : comparison.difference < 0 ? "Abaixo" : "Igual";
    const signText =
      comparison.signChange === "positive-to-negative"
        ? "; passou de positivo para negativo"
        : comparison.signChange === "negative-to-positive"
          ? "; passou de negativo para positivo"
          : "";
    return {
      text:
        comparison.difference === 0
          ? `Igual ao período anterior (${brl(comparison.previous)})`
          : `${direction} em ${brl(Math.abs(comparison.difference))}${signText}`,
      good: null,
      icon: comparison.difference >= 0 ? ArrowUpRight : ArrowDownRight,
    };
  }
  const up = comparison.percentage >= 0;
  return {
    text: `${up ? "Alta" : "Redução"} de ${percent(comparison.percentage)}`,
    good: positiveIsGood ? up : !up,
    icon: up ? ArrowUpRight : ArrowDownRight,
  };
}

export function KpiCard({
  label,
  value,
  format = "currency",
  comparison,
  positiveIsGood = true,
  hint,
}: {
  label: string;
  value: number | null;
  format?: "currency" | "percentage";
  comparison?: DashboardComparison | undefined;
  positiveIsGood?: boolean;
  hint?: string;
}) {
  const detail = comparison ? comparisonText(comparison, positiveIsGood) : null;
  const Icon = detail?.icon;
  const formatted =
    value === null
      ? "Não aplicável"
      : format === "percentage"
        ? `${value.toFixed(1).replace(".", ",")}%`
        : brl(value, true);
  return (
    <div className="surface group relative min-h-[104px] overflow-hidden p-3.5 transition-shadow hover:shadow-lift">
      <span className="absolute left-3.5 top-0 h-0.5 w-9 rounded-b-full bg-primary/70" />
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="tabular mt-1.5 text-xl font-semibold tracking-tight">{formatted}</p>
      <div className="mt-1.5 flex items-start gap-1.5">
        {detail && Icon && (
          <span
            className={cn(
              "inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground",
              detail.good === true && "text-primary",
              detail.good === false && "text-destructive",
            )}
            title={detail.text}
          >
            <Icon className="size-3 shrink-0" />
            <span className="leading-snug">{detail.text}</span>
          </span>
        )}
        {!detail && hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}
