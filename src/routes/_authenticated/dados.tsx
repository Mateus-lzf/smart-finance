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
        content: "Uma tabela leve para pesquisar, filtrar e editar seus lançamentos financeiros.",
      },
      { property: "og:title", content: productTitle("Dados e lançamentos") },
      {
        property: "og:description",
        content: "Pesquise, filtre e edite lançamentos como em um documento.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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
