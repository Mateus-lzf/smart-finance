import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "@tanstack/react-router";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { refreshCurrentSession, signOut } from "./auth-functions";
import type { AuthenticatedUser } from "./auth-types";

type AuthContextValue = {
  user: AuthenticatedUser;
  refreshing: boolean;
  signingOut: boolean;
  refresh: () => Promise<boolean>;
  logout: () => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  initialUser,
  children,
}: {
  initialUser: AuthenticatedUser;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState(initialUser);
  const [refreshing, setRefreshing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const intentionalLogout = useRef(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const refreshed = await refreshCurrentSession();
      if (!refreshed) return false;
      setUser(refreshed);
      return true;
    } finally {
      setRefreshing(false);
    }
  }, []);

  const logout = useCallback(async () => {
    intentionalLogout.current = true;
    setSigningOut(true);
    try {
      const result = await signOut();
      if (!result.ok) {
        intentionalLogout.current = false;
        return false;
      }
      window.location.assign("/login");
      return true;
    } finally {
      setSigningOut(false);
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email ?? null });
        return;
      }
      if (event === "SIGNED_OUT" && !intentionalLogout.current) {
        void router.invalidate().finally(() => {
          window.location.assign("/login?reason=session_expired");
        });
      }
    });
    return () => data.subscription.unsubscribe();
  }, [router]);

  const value = useMemo(
    () => ({ user, refreshing, signingOut, refresh, logout }),
    [user, refreshing, signingOut, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// The hook is intentionally colocated with its provider to keep the Auth boundary explicit.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
