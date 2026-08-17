import { createServerOnlyFn } from "@tanstack/react-start";
import { createSupabaseServerClient } from "../supabase/server-client";
import type { AuthenticatedUser } from "./auth-types";

export class AuthenticationRequiredError extends Error {
  readonly statusCode = 401;

  constructor() {
    super("Authentication required");
    this.name = "AuthenticationRequiredError";
  }
}

export const requireUser = createServerOnlyFn(async (): Promise<AuthenticatedUser> => {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new AuthenticationRequiredError();
  return { id: data.user.id, email: data.user.email ?? null };
});
