import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { AlertTriangle, LogOut, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/auth-provider";
import { Button } from "@/components/ui/button";

export function FinancialConfigurationUnavailable() {
  const router = useRouter();
  const { logout, signingOut } = useAuth();
  const [retrying, setRetrying] = useState(false);

  async function retry() {
    setRetrying(true);
    try {
      await router.invalidate();
    } finally {
      setRetrying(false);
    }
  }

  async function exit() {
    if (!(await logout())) toast.error("Não foi possível sair agora. Tente novamente.");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-5" aria-live="assertive">
      <div className="surface max-w-md p-7 text-center" role="alert">
        <span className="mx-auto grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive">
          <AlertTriangle className="size-5" />
        </span>
        <h1 className="mt-4 text-lg font-semibold">Dados financeiros indisponíveis</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sua sessão continua ativa, mas não foi possível definir o acesso aos seus dados
          financeiros. Tente novamente ou saia da conta.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
          <Button variant="outline" disabled={retrying || signingOut} onClick={exit}>
            <LogOut className="size-4" /> Sair da conta
          </Button>
          <Button disabled={retrying || signingOut} onClick={retry}>
            <RefreshCw className={retrying ? "size-4 animate-spin" : "size-4"} />
            {retrying ? "Tentando novamente" : "Tentar novamente"}
          </Button>
        </div>
      </div>
    </main>
  );
}
