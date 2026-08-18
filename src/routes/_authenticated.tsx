import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { AppProvider } from "@/lib/app-store";
import { AuthProvider } from "@/lib/auth/auth-provider";
import { getAuthState } from "@/lib/auth/auth-functions";
import { sanitizeInternalRedirect } from "@/lib/auth/safe-redirect";

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
    return { user: auth.user };
  },
  component: AuthenticatedApplication,
});

function AuthenticatedApplication() {
  const { user } = Route.useRouteContext();
  return (
    <AuthProvider initialUser={user}>
      <AppProvider>
        <Outlet />
      </AppProvider>
    </AuthProvider>
  );
}
