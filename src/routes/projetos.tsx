import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, FileSpreadsheet, FolderKanban, Pencil, Plus, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { AppShell } from "@/components/app/app-shell";
import { ProjectEmptyState } from "@/components/app/project-empty-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/lib/app-store";
import { brl } from "@/lib/mock-data";
import { kpisFromTransactions } from "@/lib/finance-service";
import { productTitle } from "@/lib/product-config";
import type { Project } from "@/lib/finance-types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/projetos")({
  head: () => ({ meta: [{ title: productTitle("Seus projetos financeiros") }] }),
  component: ProjetosPage,
});

type FormState = { name: string; type: string; description: string };
const emptyForm: FormState = { name: "", type: "", description: "" };

function ProjetosPage() {
  const {
    projects,
    projectId,
    setProjectId,
    createProject,
    updateProject,
    deleteProject,
    getProjectTransactions,
  } = useApp();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (project: Project) => {
    setEditing(project);
    setForm({
      name: project.name,
      type: project.type ?? "",
      description: project.description ?? "",
    });
    setDialogOpen(true);
  };

  const save = () => {
    if (!form.name.trim()) return;
    if (editing) updateProject(editing.id, form);
    else createProject(form);
    setDialogOpen(false);
  };

  return (
    <AppShell
      title="Projetos"
      description="Cada projeto mantém seus próprios lançamentos e indicadores"
      actions={
        projects.length ? (
          <>
            <Button size="sm" variant="outline" className="gap-1.5" asChild>
              <Link to="/importar">
                <FileSpreadsheet className="size-3.5" /> Importar como novo projeto
              </Link>
            </Button>
            <Button size="sm" className="gap-1.5" asChild>
              <Link to="/criar">
                <Plus className="size-3.5" /> Novo projeto
              </Link>
            </Button>
          </>
        ) : undefined
      }
    >
      {projects.length === 0 ? (
        <ProjectEmptyState onCreate={openCreate} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project, index) => {
            const active = project.id === projectId;
            const rows = getProjectTransactions(project.id);
            const kpis = kpisFromTransactions(rows);
            return (
              <motion.article
                key={project.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={cn(
                  "surface p-5 transition-all hover:-translate-y-0.5 hover:shadow-lift",
                  active && "ring-1 ring-primary/40",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-muted">
                    <FolderKanban className="size-4.5" />
                  </span>
                  <div className="flex items-center gap-1">
                    {active && (
                      <span className="mr-1 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                        Ativo
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      title="Renomear projeto"
                      onClick={() => openEdit(project)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Excluir projeto"
                      className="size-8 text-destructive hover:text-destructive"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Excluir o projeto “${project.name}” e todos os seus lançamentos?`,
                          )
                        )
                          deleteProject(project.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <h2 className="mt-4 text-[15px] font-medium">{project.name}</h2>
                <p className="mt-0.5 min-h-5 text-xs text-muted-foreground">
                  {project.type || "Projeto financeiro"}
                </p>
                {project.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {project.description}
                  </p>
                )}
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Receita do mês</dt>
                    <dd className="tabular font-medium">{brl(kpis.receita.value, true)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Lucro</dt>
                    <dd className="tabular font-medium text-primary">
                      {brl(kpis.lucro.value, true)}
                    </dd>
                  </div>
                </dl>
                <p className="mt-2 text-xs text-muted-foreground">
                  {rows.length} lançamento{rows.length === 1 ? "" : "s"}
                </p>
                <Button
                  size="sm"
                  variant={active ? "outline" : "default"}
                  className="mt-5 gap-1.5"
                  asChild
                  onClick={() => setProjectId(project.id)}
                >
                  <Link to="/dashboard">
                    Abrir dashboard <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              </motion.article>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar projeto" : "Criar projeto"}</DialogTitle>
            <DialogDescription>
              O nome é obrigatório. Tipo e descrição são opcionais.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="project-name">Nome</Label>
              <Input
                id="project-name"
                autoFocus
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Ex.: Minha empresa"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-type">Tipo</Label>
              <Input
                id="project-type"
                value={form.type}
                onChange={(event) =>
                  setForm((current) => ({ ...current, type: event.target.value }))
                }
                placeholder="Ex.: Comércio, serviços ou pessoal"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-description">Descrição</Label>
              <Textarea
                id="project-description"
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                placeholder="Uma breve descrição do projeto"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={!form.name.trim()} onClick={save}>
              {editing ? "Salvar alterações" : "Criar projeto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
