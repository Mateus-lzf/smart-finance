import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
} from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PRODUCT_NAME } from "@/lib/product-config";
import { cn } from "@/lib/utils";
import { persistTheme, readStoredTheme, type Theme } from "@/lib/theme-service";
import { LegalLinks } from "@/components/legal-page";

export function AuthPage({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(readStoredTheme());
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    persistTheme(next);
  }

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,0.7fr)]">
      <section className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,color-mix(in_oklch,var(--sidebar-primary)_18%,transparent),transparent_42%)]" />
        <div className="relative flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
            <Sparkles className="size-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight">{PRODUCT_NAME}</span>
        </div>
        <div className="relative max-w-lg">
          <p className="text-3xl font-semibold leading-tight tracking-tight">
            Seus dados financeiros organizados com clareza.
          </p>
          <p className="mt-4 max-w-md text-sm leading-6 text-sidebar-foreground/70">
            Importe planilhas, acompanhe resultados e consulte análises determinísticas em um só
            lugar.
          </p>
        </div>
        <p className="relative flex items-center gap-2 text-xs text-sidebar-foreground/60">
          <ShieldCheck className="size-4" /> Acesso protegido à sua conta
        </p>
      </section>

      <section className="relative flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <button
          type="button"
          onClick={toggleTheme}
          className="absolute right-5 top-5 grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}
          title={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}
        >
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="size-4" />
            </span>
            <span className="font-semibold tracking-tight">{PRODUCT_NAME}</span>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
            <div className="mt-7">{children}</div>
          </div>
          {footer && <div className="mt-5 text-center text-sm text-muted-foreground">{footer}</div>}
          <div className="mt-4 text-xs text-muted-foreground">
            <LegalLinks />
          </div>
        </div>
      </section>
    </main>
  );
}

export function AuthField({
  id,
  label,
  type = "text",
  autoComplete,
  value,
  onChange,
  required = true,
  minLength,
}: {
  id: string;
  label: string;
  type?: string;
  autoComplete?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        minLength={minLength}
      />
    </div>
  );
}

export function AuthNotice({
  children,
  tone = "error",
}: {
  children: ReactNode;
  tone?: "error" | "success" | "info";
}) {
  const Icon = tone === "success" ? CheckCircle2 : AlertCircle;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex gap-2.5 rounded-xl border px-3 py-2.5 text-sm leading-5",
        tone === "error" && "border-destructive/25 bg-destructive/5 text-destructive",
        tone === "success" && "border-primary/25 bg-primary/5 text-foreground",
        tone === "info" && "border-border bg-muted/50 text-muted-foreground",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function AuthSubmit({ loading, children }: { loading: boolean; children: ReactNode }) {
  return (
    <Button type="submit" className="w-full" disabled={loading}>
      {loading && <LoaderCircle className="size-4 animate-spin" />}
      {children}
    </Button>
  );
}

export type AuthFormEvent = FormEvent<HTMLFormElement>;

export function AuthLink({
  to,
  children,
}: {
  to: "/login" | "/cadastro" | "/esqueci-senha" | "/privacidade" | "/termos";
  children: ReactNode;
}) {
  return (
    <Link to={to} className="font-medium text-primary underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}
