import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { PRODUCT_NAME } from "@/lib/product-config";

export function LegalPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/80">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link to="/login" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="size-4" />
            </span>
            {PRODUCT_NAME}
          </Link>
          <nav
            aria-label="Documentos e acesso"
            className="flex flex-wrap items-center gap-4 text-sm"
          >
            <Link to="/privacidade" className="text-muted-foreground hover:text-foreground">
              Privacidade
            </Link>
            <Link to="/termos" className="text-muted-foreground hover:text-foreground">
              Termos
            </Link>
            <Link
              to="/login"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Entrar
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
        <header className="max-w-3xl border-b border-border pb-8">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
            Documento informativo da versão em desenvolvimento
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">{description}</p>
        </header>
        <article className="legal-content max-w-3xl py-8">{children}</article>
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-muted-foreground sm:px-8">
          <span>{PRODUCT_NAME}</span>
          <nav aria-label="Links legais" className="flex gap-4">
            <Link to="/privacidade" className="hover:text-foreground">
              Privacidade
            </Link>
            <Link to="/termos" className="hover:text-foreground">
              Termos de Uso
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export function LegalLinks() {
  return (
    <nav aria-label="Informações legais" className="flex flex-wrap justify-center gap-x-4 gap-y-2">
      <Link to="/privacidade" className="underline-offset-4 hover:text-foreground hover:underline">
        Privacidade
      </Link>
      <Link to="/termos" className="underline-offset-4 hover:text-foreground hover:underline">
        Termos de Uso
      </Link>
    </nav>
  );
}
