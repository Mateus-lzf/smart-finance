import { createFileRoute } from "@tanstack/react-router";
import { Lightbulb } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { ProjectEmptyState } from "@/components/app/project-empty-state";
import { useApp } from "@/lib/app-store";

export const Route = createFileRoute("/insights")({
  head: () => ({ meta: [{ title: "Insights financeiros — Clareza" }] }),
  component: InsightsPage,
});

function InsightsPage() {
  const { project } = useApp();
  return (
    <AppShell
      title="Insights"
      description={
        project ? `Análises de ${project.name}` : "Selecione ou crie um projeto para continuar"
      }
    >
      {!project ? (
        <ProjectEmptyState />
      ) : (
        <div className="surface mx-auto flex max-w-xl flex-col items-center px-6 py-14 text-center">
          <span className="grid size-12 place-items-center rounded-xl bg-accent text-accent-foreground">
            <Lightbulb className="size-5" />
          </span>
          <h2 className="mt-5 text-lg font-medium">Insights indisponíveis</h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Ainda não há dados suficientes para gerar este insight.
          </p>
        </div>
      )}
    </AppShell>
  );
}
