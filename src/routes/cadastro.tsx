import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  AuthField,
  type AuthFormEvent,
  AuthLink,
  AuthNotice,
  AuthPage,
  AuthSubmit,
} from "@/components/auth/auth-page";
import { getAuthState, resendSignupConfirmation, signUp } from "@/lib/auth/auth-functions";
import { sanitizeInternalRedirect } from "@/lib/auth/safe-redirect";
import { productTitle } from "@/lib/product-config";

export const Route = createFileRoute("/cadastro")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: async ({ search }) => {
    const auth = await getAuthState();
    if (auth.status === "unavailable") throw redirect({ to: "/auth-indisponivel", replace: true });
    if (auth.status === "authenticated")
      throw redirect({ href: sanitizeInternalRedirect(search.redirect), replace: true });
  },
  head: () => ({ meta: [{ title: productTitle("Criar conta") }] }),
  component: SignupPage,
});

function SignupPage() {
  const { redirect: next } = Route.useSearch();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState(false);

  async function handleSubmit(event: AuthFormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(false);
    try {
      const result = await signUp({
        data: { email, password, displayName, next: sanitizeInternalRedirect(next) },
      });
      if (!result.ok) setError(true);
      else setSent(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setLoading(true);
    setError(false);
    try {
      const result = await resendSignupConfirmation({
        data: { email, next: sanitizeInternalRedirect(next) },
      });
      if (!result.ok) setError(true);
      else setResent(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthPage
      title="Criar sua conta"
      description="Use seus dados para proteger o acesso ao Smart Finance."
      footer={
        <>
          Já tem uma conta? <AuthLink to="/login">Entrar</AuthLink>
        </>
      }
    >
      {sent ? (
        <div className="space-y-5">
          <AuthNotice tone="success">
            Enviamos um link de confirmação para {email}. Abra o e-mail para concluir seu acesso.
          </AuthNotice>
          {resent && <AuthNotice tone="info">Um novo link foi enviado.</AuthNotice>}
          {error && <AuthNotice>Não foi possível reenviar agora. Tente novamente.</AuthNotice>}
          <Button variant="outline" className="w-full" disabled={loading} onClick={resend}>
            Reenviar e-mail de confirmação
          </Button>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={handleSubmit}>
          {error && (
            <AuthNotice>
              Não foi possível criar a conta. Revise os dados ou tente novamente.
            </AuthNotice>
          )}
          <AuthField
            id="displayName"
            label="Nome"
            autoComplete="name"
            value={displayName}
            onChange={setDisplayName}
          />
          <AuthField
            id="email"
            label="E-mail"
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
          />
          <AuthField
            id="password"
            label="Senha"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
            minLength={8}
          />
          <p className="text-xs text-muted-foreground">Use pelo menos 8 caracteres.</p>
          <AuthSubmit loading={loading}>Criar conta</AuthSubmit>
        </form>
      )}
    </AuthPage>
  );
}
