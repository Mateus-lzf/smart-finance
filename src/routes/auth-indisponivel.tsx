import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/auth-indisponivel")({
  component: AuthUnavailableCheckpointPlaceholder,
});

function AuthUnavailableCheckpointPlaceholder() {
  return <main>Não foi possível verificar sua conta agora. Tente novamente.</main>;
}
