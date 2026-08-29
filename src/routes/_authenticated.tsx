import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { AppProvider } from "@/lib/app-store";
import { AuthProvider, useAuth } from "@/lib/auth/auth-provider";
import { getAuthState } from "@/lib/auth/auth-functions";
import { sanitizeInternalRedirect } from "@/lib/auth/safe-redirect";
import { getFinancialMode } from "@/lib/financial-mode-functions";
import { FinancialStateGate } from "@/components/app/financial-state-gate";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const auth = await getAuthState();
    if (auth.status === "unavailable") {
      throw redirect({ to: "/auth-indisponivel", replace: true });
    }
    if (auth.status === "unauthenticated") {
      throw redirect({
        to: "/login",
        search: {
          redirect: sanitizeInternalRedirect(location.href, "/dashboard"),
          reason: auth.reason === "missing" ? undefined : "session_expired",
        },
        replace: true,
      });
    }
    const financialMode = await getFinancialMode();
    if (financialMode.status === "unavailable") {
      throw redirect({ to: "/auth-indisponivel", replace: true });
    }
    return { user: auth.user, financialMode: financialMode.mode };
  },
  component: AuthenticatedApplication,
});

function AuthenticatedApplication() {
  const { user, financialMode } = Route.useRouteContext();
  return (
    <AuthProvider initialUser={user}>
      <AuthenticatedFinancialState mode={financialMode} />
    </AuthProvider>
  );
}

function AuthenticatedFinancialState({ mode }: { mode: "local" | "remote" }) {
  const { user } = useAuth();
  return (
    <AppProvider key={`${user.id}:${mode}`} userId={user.id} mode={mode}>
      <FinancialStateGate>
        <Outlet />
      </FinancialStateGate>
    </AppProvider>
  );
}
