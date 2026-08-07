import { FileSpreadsheet, FolderPlus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function ProjectEmptyState({ onCreate }: { onCreate?: () => void }) {
  return (
    <div className="surface mx-auto flex max-w-xl flex-col items-center px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-xl bg-accent text-accent-foreground">
        <FolderPlus className="size-5" />
      </span>
      <h2 className="mt-5 text-lg font-medium">Você ainda não possui projetos</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        Crie um projeto vazio ou importe uma planilha para começar a organizar seus dados.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {onCreate ? (
          <Button onClick={onCreate} className="gap-1.5">
            <FolderPlus className="size-4" /> Criar projeto
          </Button>
        ) : (
          <Button asChild className="gap-1.5">
            <Link to="/criar">
              <FolderPlus className="size-4" /> Criar projeto
            </Link>
          </Button>
        )}
        <Button variant="outline" asChild className="gap-1.5">
          <Link to="/importar">
            <FileSpreadsheet className="size-4" /> Importar planilha
          </Link>
        </Button>
      </div>
    </div>
  );
}
