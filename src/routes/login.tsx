import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { getAuthState } from "@/lib/auth/auth-functions";
import { sanitizeInternalRedirect } from "@/lib/auth/safe-redirect";

const loginSearchSchema = z.object({
  redirect: z.string().optional(),
  reason: z.enum(["session_expired"]).optional(),
  authError: z.enum(["invalid_callback"]).optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: loginSearchSchema,
  beforeLoad: async ({ search }) => {
    const auth = await getAuthState();
    if (auth.status === "unavailable") {
      throw redirect({ to: "/auth-indisponivel", replace: true });
    }
    if (auth.status === "authenticated") {
      throw redirect({ href: sanitizeInternalRedirect(search.redirect), replace: true });
    }
  },
  component: LoginCheckpointPlaceholder,
});

function LoginCheckpointPlaceholder() {
  return <main aria-label="Autenticação">Autenticação do Smart Finance em preparação.</main>;
}
