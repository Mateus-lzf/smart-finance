import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { productTitle } from "@/lib/product-config";
import { useState } from "react";
import { FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/lib/app-store";

export const Route = createFileRoute("/_authenticated/criar")({
  head: () => ({ meta: [{ title: productTitle("Criar projeto") }] }),
  component: CreateProjectPage,
});

function CreateProjectPage() {
  const navigate = useNavigate();
  const { createProject } = useApp();
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");

  const submit = async () => {
    if (!name.trim()) return;
    createProject({ name, type, description });
    await navigate({ to: "/dashboard" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-16">
      <div className="surface w-full max-w-lg p-7">
        <span className="grid size-11 place-items-center rounded-xl bg-accent text-accent-foreground">
          <FolderPlus className="size-5" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Criar projeto</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          O nome é obrigatório. Tipo e descrição são opcionais.
        </p>
        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Minha empresa"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="type">Tipo</Label>
            <Input
              id="type"
              value={type}
              onChange={(event) => setType(event.target.value)}
              placeholder="Ex.: Comércio, serviços ou pessoal"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Uma breve descrição do projeto"
            />
          </div>
          <Button type="submit" disabled={!name.trim()} className="w-full">
            Criar projeto
          </Button>
        </form>
      </div>
    </div>
  );
}
