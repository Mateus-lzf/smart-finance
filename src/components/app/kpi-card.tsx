import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { brl } from "@/lib/mock-data";

export function KpiCard({
  label,
  value,
  delta,
  positiveIsGood = true,
  hint,
}: {
  label: string;
  value: number;
  delta: number;
  positiveIsGood?: boolean;
  hint?: string;
}) {
  const up = delta >= 0;
  const good = positiveIsGood ? up : !up;
  return (
    <div className="surface group p-4 transition-shadow hover:shadow-lift">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="tabular mt-2 text-2xl font-semibold tracking-tight">{brl(value, true)}</p>
      <div className="mt-2 flex items-center gap-1.5">
        <span
          className={cn(
            "tabular inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium",
            good ? "bg-accent text-accent-foreground" : "bg-destructive/10 text-destructive",
          )}
        >
          {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
          {Math.abs(delta).toFixed(1)}%
        </span>
        {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}
