import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ProjectEmptyState } from "@/components/app/project-empty-state";
import { productTitle } from "@/lib/product-config";
import { useApp } from "@/lib/app-store";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: productTitle("Organização financeira para o seu negócio") },
      {
        name: "description",
        content:
          "Importe sua planilha ou crie um projeto para acompanhar seus indicadores financeiros.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const { projects, hydrated } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    if (hydrated && projects.length > 0) void navigate({ to: "/dashboard" });
  }, [hydrated, projects.length, navigate]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-16">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-accent/50 to-transparent" />
      <div className="relative w-full">
        <ProjectEmptyState />
      </div>
    </div>
  );
}
