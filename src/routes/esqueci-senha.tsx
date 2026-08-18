import { createFileRoute, redirect } from "@tanstack/react-router";
import { getAuthState } from "@/lib/auth/auth-functions";

export const Route = createFileRoute("/esqueci-senha")({
  beforeLoad: async () => {
    const auth = await getAuthState();
    if (auth.status === "unavailable") {
      throw redirect({ to: "/auth-indisponivel", replace: true });
    }
    if (auth.status === "authenticated") {
      throw redirect({ to: "/dashboard", replace: true });
    }
  },
  component: () => <main>Recuperação de senha do Smart Finance em preparação.</main>,
});
