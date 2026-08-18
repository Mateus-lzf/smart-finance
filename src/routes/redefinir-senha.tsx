import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import {
  AuthField,
  type AuthFormEvent,
  AuthNotice,
  AuthPage,
  AuthSubmit,
} from "@/components/auth/auth-page";
import { getAuthState, signOut, updateRecoveredPassword } from "@/lib/auth/auth-functions";
import { productTitle } from "@/lib/product-config";

export const Route = createFileRoute("/redefinir-senha")({
  beforeLoad: async () => {
    const auth = await getAuthState();
    if (auth.status === "unavailable") throw redirect({ to: "/auth-indisponivel", replace: true });
    if (auth.status !== "authenticated") throw redirect({ to: "/esqueci-senha", replace: true });
  },
  head: () => ({ meta: [{ title: productTitle("Redefinir senha") }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: AuthFormEvent) {
    event.preventDefault();
    if (password !== confirmation) {
      setError("As senhas informadas não são iguais.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await updateRecoveredPassword({ data: { password } });
      if (!result.ok) {
        setError("Não foi possível redefinir a senha agora.");
        return;
      }
      await signOut();
      window.location.assign("/login?status=password_updated");
    } catch {
      setError("Não foi possível redefinir a senha agora.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthPage
      title="Criar nova senha"
      description="Escolha uma nova senha com pelo menos 8 caracteres."
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        {error && <AuthNotice>{error}</AuthNotice>}
        <AuthField
          id="password"
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          minLength={8}
        />
        <AuthField
          id="confirmation"
          label="Confirmar nova senha"
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={setConfirmation}
          minLength={8}
        />
        <AuthSubmit loading={loading}>Salvar nova senha</AuthSubmit>
      </form>
    </AuthPage>
  );
}
