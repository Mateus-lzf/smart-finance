import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import {
  AuthField,
  type AuthFormEvent,
  AuthLink,
  AuthNotice,
  AuthPage,
  AuthSubmit,
} from "@/components/auth/auth-page";
import { getAuthState, signIn } from "@/lib/auth/auth-functions";
import { sanitizeInternalRedirect } from "@/lib/auth/safe-redirect";
import { productTitle } from "@/lib/product-config";

const loginSearchSchema = z.object({
  redirect: z.string().optional(),
  reason: z.enum(["session_expired"]).optional(),
  authError: z.enum(["invalid_callback"]).optional(),
  status: z.enum(["password_updated"]).optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: loginSearchSchema,
  beforeLoad: async ({ search }) => {
    const auth = await getAuthState();
    if (auth.status === "unavailable") throw redirect({ to: "/auth-indisponivel", replace: true });
    if (auth.status === "authenticated") {
      throw redirect({ href: sanitizeInternalRedirect(search.redirect), replace: true });
    }
  },
  head: () => ({ meta: [{ title: productTitle("Entrar") }] }),
  component: LoginPage,
});

function LoginPage() {
  const search = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<"invalid" | "unconfirmed" | "unavailable" | null>(null);

  async function handleSubmit(event: AuthFormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await signIn({ data: { email, password } });
      if (!result.ok) {
        setError(
          result.code === "invalid_credentials"
            ? "invalid"
            : result.code === "email_not_confirmed"
              ? "unconfirmed"
              : "unavailable",
        );
        return;
      }
      window.location.assign(sanitizeInternalRedirect(search.redirect));
    } catch {
      setError("unavailable");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthPage
      title="Entrar na sua conta"
      description="Acesse o Smart Finance com seu e-mail e senha."
      footer={
        <>
          Ainda não tem conta? <AuthLink to="/cadastro">Criar conta</AuthLink>
        </>
      }
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        {search.reason === "session_expired" && (
          <AuthNotice tone="info">Sua sessão terminou. Entre novamente para continuar.</AuthNotice>
        )}
        {search.authError === "invalid_callback" && (
          <AuthNotice>
            Este link não é válido ou já foi utilizado. Solicite um novo link.
          </AuthNotice>
        )}
        {search.status === "password_updated" && (
          <AuthNotice tone="success">Senha redefinida. Entre com sua nova senha.</AuthNotice>
        )}
        {error === "invalid" && <AuthNotice>E-mail ou senha incorretos.</AuthNotice>}
        {error === "unconfirmed" && (
          <AuthNotice>
            Confirme seu e-mail antes de entrar. Você pode reenviar o link no cadastro.
          </AuthNotice>
        )}
        {error === "unavailable" && (
          <AuthNotice>
            Não foi possível entrar agora. Verifique sua conexão e tente novamente.
          </AuthNotice>
        )}
        <AuthField
          id="email"
          label="E-mail"
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
        />
        <div>
          <AuthField
            id="password"
            label="Senha"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            minLength={8}
          />
          <div className="mt-2 text-right text-sm">
            <AuthLink to="/esqueci-senha">Esqueci minha senha</AuthLink>
          </div>
        </div>
        <AuthSubmit loading={loading}>Entrar</AuthSubmit>
      </form>
    </AuthPage>
  );
}
