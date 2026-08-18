import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import {
  AuthField,
  type AuthFormEvent,
  AuthLink,
  AuthNotice,
  AuthPage,
  AuthSubmit,
} from "@/components/auth/auth-page";
import { getAuthState, requestPasswordRecovery } from "@/lib/auth/auth-functions";
import { productTitle } from "@/lib/product-config";

export const Route = createFileRoute("/esqueci-senha")({
  beforeLoad: async () => {
    const auth = await getAuthState();
    if (auth.status === "unavailable") throw redirect({ to: "/auth-indisponivel", replace: true });
    if (auth.status === "authenticated") throw redirect({ to: "/dashboard", replace: true });
  },
  head: () => ({ meta: [{ title: productTitle("Recuperar senha") }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(false);

  async function handleSubmit(event: AuthFormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(false);
    try {
      const result = await requestPasswordRecovery({ data: { email } });
      if (!result.ok) setError(true);
      else setSent(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthPage
      title="Recuperar senha"
      description="Informe seu e-mail para receber um link seguro de redefinição."
      footer={<AuthLink to="/login">Voltar para o login</AuthLink>}
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        {sent && (
          <AuthNotice tone="success">
            Se o e-mail estiver cadastrado, você receberá as instruções de recuperação.
          </AuthNotice>
        )}
        {error && (
          <AuthNotice>Não foi possível enviar as instruções agora. Tente novamente.</AuthNotice>
        )}
        {!sent && (
          <AuthField
            id="email"
            label="E-mail"
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
          />
        )}
        {!sent && <AuthSubmit loading={loading}>Enviar instruções</AuthSubmit>}
      </form>
    </AuthPage>
  );
}
