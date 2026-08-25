import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { useApp } from "@/lib/app-store";
import { useAuth } from "@/lib/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { PRODUCT_NAME } from "@/lib/product-config";

export function FinancialStateGate({ children }: { children: ReactNode }) {
  const { financialStatus, financialError, retryFinancialWorkspace } = useApp();
  const { refresh } = useAuth();

  if (financialStatus === "ready") return children;

  if (financialStatus === "initializing") {
    return (
      <main
        className="grid min-h-screen place-items-center bg-background px-5"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="text-center" role="status">
          <span className="mx-auto grid size-11 place-items-center rounded-xl bg-accent text-primary">
            <Loader2 className="size-5 animate-spin" />
          </span>
          <p className="mt-4 font-medium">Carregando seus dados financeiros</p>
          <p className="mt-1 text-sm text-muted-foreground">{PRODUCT_NAME}</p>
        </div>
      </main>
    );
  }

  const unauthorized = financialStatus === "unauthorized";
  return (
    <main className="grid min-h-screen place-items-center bg-background px-5" aria-live="assertive">
      <div className="surface max-w-md p-7 text-center" role="alert">
        <span className="mx-auto grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive">
          <AlertTriangle className="size-5" />
        </span>
        <h1 className="mt-4 text-lg font-semibold">
          {unauthorized
            ? "Sua sessão precisa ser renovada"
            : "Não foi possível carregar seus dados"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {financialError ??
            (unauthorized
              ? "Atualize sua sessão para continuar com segurança."
              : "Tente novamente. O modo financeiro selecionado será mantido.")}
        </p>
        <Button
          className="mt-5"
          onClick={() => {
            if (!unauthorized) {
              void retryFinancialWorkspace();
              return;
            }
            void refresh().then(async (ok) => {
              if (ok) await retryFinancialWorkspace();
            });
          }}
        >
          <RefreshCw className="size-4" /> {unauthorized ? "Atualizar sessão" : "Tentar novamente"}
        </Button>
      </div>
    </main>
  );
}
