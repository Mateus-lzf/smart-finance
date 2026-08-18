import { createFileRoute, redirect } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { z } from "zod";
import { AuthPage } from "@/components/auth/auth-page";
import { exchangeAuthCode } from "@/lib/auth/auth-functions";
import { sanitizeInternalRedirect } from "@/lib/auth/safe-redirect";

const callbackSearchSchema = z.object({
  code: z.string().optional(),
  next: z.string().optional(),
  sb_flow_id: z.string().optional(),
});

export const Route = createFileRoute("/auth/callback")({
  validateSearch: callbackSearchSchema,
  beforeLoad: async ({ search }) => {
    if (!search.code) {
      throw redirect({ to: "/login", search: { authError: "invalid_callback" }, replace: true });
    }
    const result = await exchangeAuthCode({
      data: { code: search.code, ...(search.sb_flow_id ? { flowId: search.sb_flow_id } : {}) },
    });
    if (!result.ok) {
      if (result.code === "unavailable")
        throw redirect({ to: "/auth-indisponivel", replace: true });
      throw redirect({ to: "/login", search: { authError: "invalid_callback" }, replace: true });
    }
    throw redirect({ href: sanitizeInternalRedirect(search.next), replace: true });
  },
  component: CallbackPage,
});

function CallbackPage() {
  return (
    <AuthPage title="Confirmando seu acesso" description="Estamos validando o link de segurança.">
      <div className="flex items-center gap-3 text-sm text-muted-foreground" role="status">
        <LoaderCircle className="size-5 animate-spin text-primary" />
        Aguarde um instante.
      </div>
    </AuthPage>
  );
}
