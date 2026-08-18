import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { getAuthState } from "@/lib/auth/auth-functions";
import { sanitizeInternalRedirect } from "@/lib/auth/safe-redirect";

export const Route = createFileRoute("/cadastro")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: async ({ search }) => {
    const auth = await getAuthState();
    if (auth.status === "unavailable") {
      throw redirect({ to: "/auth-indisponivel", replace: true });
    }
    if (auth.status === "authenticated") {
      throw redirect({ href: sanitizeInternalRedirect(search.redirect), replace: true });
    }
  },
  component: () => <main>Criação de conta do Smart Finance em preparação.</main>,
});
