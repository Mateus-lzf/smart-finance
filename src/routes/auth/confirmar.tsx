import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { AuthNotice, AuthPage, AuthSubmit } from "@/components/auth/auth-page";
import { verifyEmailToken } from "@/lib/auth/auth-functions";
import { sanitizeInternalRedirect } from "@/lib/auth/safe-redirect";
import { productTitle } from "@/lib/product-config";

const emailActionSearchSchema = z.object({
  next: z.string().optional(),
});

type EmailAction = { tokenHash: string; type: "email" | "recovery" };

export const Route = createFileRoute("/auth/confirmar")({
  validateSearch: emailActionSearchSchema,
  head: () => ({ meta: [{ title: productTitle("Confirmar acesso") }] }),
  component: ConfirmEmailActionPage,
});

function ConfirmEmailActionPage() {
  const search = Route.useSearch();
  const [action, setAction] = useState<EmailAction | null>(null);
  const [readingLink, setReadingLink] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<"invalid" | "unavailable" | null>(null);
  const isRecovery = action?.type === "recovery";

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const tokenHash = fragment.get("token_hash");
    const type = fragment.get("type");
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    if (tokenHash && (type === "email" || type === "recovery")) {
      setAction({ tokenHash, type });
    } else {
      setError("invalid");
    }
    setReadingLink(false);
  }, []);

  async function handleConfirmation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) {
      setError("invalid");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await verifyEmailToken({
        data: action,
      });
      if (!result.ok) {
        setError(result.code === "unavailable" ? "unavailable" : "invalid");
        return;
      }
      window.location.assign(
        sanitizeInternalRedirect(search.next, isRecovery ? "/redefinir-senha" : "/dashboard"),
      );
    } catch {
      setError("unavailable");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthPage
      title={isRecovery ? "Confirmar recuperação" : "Confirmar seu e-mail"}
      description={
        isRecovery
          ? "Confirme esta solicitação para escolher uma nova senha."
          : "Confirme seu endereço de e-mail para acessar sua conta."
      }
    >
      <form className="space-y-5" onSubmit={handleConfirmation}>
        {error === "invalid" && (
          <AuthNotice>
            Este link não é válido, expirou ou já foi utilizado. Solicite um novo link para
            continuar.
          </AuthNotice>
        )}
        {error === "unavailable" && (
          <AuthNotice>
            Não foi possível confirmar o link agora. Tente novamente em alguns instantes.
          </AuthNotice>
        )}
        {!readingLink && (!error || error === "unavailable") ? (
          <AuthSubmit loading={loading}>
            {isRecovery ? "Continuar recuperação" : "Confirmar e continuar"}
          </AuthSubmit>
        ) : null}
      </form>
    </AuthPage>
  );
}
