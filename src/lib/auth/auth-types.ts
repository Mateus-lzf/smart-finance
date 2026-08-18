export type AuthenticatedUser = {
  id: string;
  email: string | null;
};

export type AuthResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; code: "invalid_credentials" | "email_not_confirmed" | "unavailable" };

export type AuthState =
  | { status: "authenticated"; user: AuthenticatedUser }
  | { status: "unauthenticated"; reason: "missing" | "invalid" | "expired" }
  | { status: "unavailable" };

export type AuthActionResult =
  { ok: true } | { ok: false; code: "invalid_or_expired" | "unavailable" };
