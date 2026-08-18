import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthNotice, AuthPage } from "@/components/auth/auth-page";
import { Button } from "@/components/ui/button";
import { productTitle } from "@/lib/product-config";

export const Route = createFileRoute("/auth-indisponivel")({
  head: () => ({ meta: [{ title: productTitle("Acesso indisponível") }] }),
  component: AuthUnavailablePage,
});

function AuthUnavailablePage() {
  return (
    <AuthPage
      title="Acesso temporariamente indisponível"
      description="Não conseguimos verificar sua conta neste momento."
    >
      <div className="space-y-5">
        <AuthNotice tone="info">
          Seus dados financeiros neste dispositivo não foram alterados. Aguarde um momento e tente
          novamente.
        </AuthNotice>
        <Button asChild className="w-full">
          <Link to="/login">Tentar novamente</Link>
        </Button>
      </div>
    </AuthPage>
  );
}
