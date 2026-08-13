import { TrendingUp, AlertTriangle, Info, ArrowLeftRight } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { Insight } from "@/lib/insight-types";

const meta = {
  positivo: {
    label: "Positivo",
    icon: TrendingUp,
    dot: "bg-success",
    chip: "bg-accent text-accent-foreground",
  },
  atencao: {
    label: "Atenção",
    icon: AlertTriangle,
    dot: "bg-warning",
    chip: "bg-warning/15 text-warning",
  },
  informativo: {
    label: "Informativo",
    icon: Info,
    dot: "bg-primary",
    chip: "bg-muted text-muted-foreground",
  },
  mudanca: {
    label: "Mudança",
    icon: ArrowLeftRight,
    dot: "bg-primary",
    chip: "bg-accent text-accent-foreground",
  },
} as const;

export function InsightCard({ insight, index = 0 }: { insight: Insight; index?: number }) {
  const m = meta[insight.level];
  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="surface flex flex-col gap-3 p-5 transition-shadow hover:shadow-lift"
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
            m.chip,
          )}
        >
          <m.icon className="size-3" />
          {m.label}
        </span>
        {insight.metric && <span className="tabular text-sm font-semibold">{insight.metric}</span>}
      </div>
      <h3 className="text-[15px] font-medium leading-snug">{insight.title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{insight.body}</p>
      <p className="mt-auto border-t border-border pt-3 text-xs text-muted-foreground">
        {insight.periodLabel}
      </p>
    </motion.article>
  );
}
