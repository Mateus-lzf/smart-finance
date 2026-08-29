import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/app-shell";
import { DataTable } from "@/components/app/data-table";
import { ProjectEmptyState } from "@/components/app/project-empty-state";
import { productTitle } from "@/lib/product-config";
import { useApp } from "@/lib/app-store";

export const Route = createFileRoute("/_authenticated/dados")({
  head: () => ({
    meta: [
      { title: productTitle("Dados e lançamentos") },
      {
        name: "description",
        content: "Pesquise, filtre, crie e edite os lançamentos financeiros do projeto.",
      },
    ],
  }),
  component: DadosPage,
});

function DadosPage() {
  const { project } = useApp();
  if (!project) {
    return (
      <AppShell title="Dados" description="Selecione ou crie um projeto para continuar">
        <ProjectEmptyState />
      </AppShell>
    );
  }
  return (
    <AppShell title="Dados" description={`Lançamentos de ${project.name}`}>
      <DataTable />
    </AppShell>
  );
}
