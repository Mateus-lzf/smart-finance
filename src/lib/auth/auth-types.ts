export type AuthenticatedUser = {
  id: string;
  email: string | null;
};

export type AuthResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; code: "invalid_credentials" | "email_not_confirmed" | "unavailable" };
