import type { SupabaseClient } from "@supabase/supabase-js";
import { classifySessionFailure } from "../auth/auth-functions";
import type { Database } from "../supabase/database.types";
import { createSupabaseServerClient } from "../supabase/server-client";

type AccountDeletionClient = Pick<SupabaseClient<Database>, "auth" | "rpc">;

export type AccountDeletionError =
  | "authentication_required"
  | "invalid_password"
  | "reauthentication_unavailable"
  | "reauthentication_mismatch"
  | "password_reauthentication_required"
  | "password_reauthentication_expired"
  | "deletion_failed";

export type AccountDeletionResult =
  { ok: true; redirectTo: "/login" } | { ok: false; code: AccountDeletionError };

type AccountDeletionDependencies = {
  client?: AccountDeletionClient;
};

function errorText(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const candidate = error as { code?: unknown; message?: unknown };
  return `${typeof candidate.code === "string" ? candidate.code : ""} ${
    typeof candidate.message === "string" ? candidate.message : ""
  }`.toLowerCase();
}

function classifyReauthenticationError(error: unknown): AccountDeletionError {
  const normalized = errorText(error);
  if (normalized.includes("invalid login credentials")) return "invalid_password";
  return "reauthentication_unavailable";
}

function classifyDeletionError(error: unknown): AccountDeletionError {
  const normalized = errorText(error);
  if (normalized.includes("account_deletion_authentication_required")) {
    return "authentication_required";
  }
  if (normalized.includes("account_deletion_password_reauthentication_required")) {
    return "password_reauthentication_required";
  }
  if (normalized.includes("account_deletion_password_reauthentication_expired")) {
    return "password_reauthentication_expired";
  }
  return "deletion_failed";
}

export async function deleteAuthenticatedAccount(
  password: string,
  dependencies: AccountDeletionDependencies = {},
): Promise<AccountDeletionResult> {
  const client = dependencies.client ?? createSupabaseServerClient();

  let originalUser;
  try {
    const current = await client.auth.getUser();
    if (current.error || !current.data.user) {
      if (!current.error) return { ok: false, code: "authentication_required" };
      return {
        ok: false,
        code:
          classifySessionFailure(current.error).status === "unavailable"
            ? "reauthentication_unavailable"
            : "authentication_required",
      };
    }
    originalUser = current.data.user;
  } catch {
    return { ok: false, code: "reauthentication_unavailable" };
  }

  if (!originalUser.email) return { ok: false, code: "reauthentication_unavailable" };

  let reauthenticatedUser;
  try {
    const reauthentication = await client.auth.signInWithPassword({
      email: originalUser.email,
      password,
    });
    if (reauthentication.error || !reauthentication.data.user) {
      return {
        ok: false,
        code: reauthentication.error
          ? classifyReauthenticationError(reauthentication.error)
          : "reauthentication_unavailable",
      };
    }
    reauthenticatedUser = reauthentication.data.user;
  } catch {
    return { ok: false, code: "reauthentication_unavailable" };
  }

  if (reauthenticatedUser.id !== originalUser.id) {
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    return { ok: false, code: "reauthentication_mismatch" };
  }

  try {
    const deletion = await client.rpc("delete_current_account");
    if (deletion.error || deletion.data !== true) {
      return {
        ok: false,
        code: deletion.error ? classifyDeletionError(deletion.error) : "deletion_failed",
      };
    }
  } catch {
    return { ok: false, code: "deletion_failed" };
  }

  try {
    await client.auth.signOut({ scope: "local" });
  } catch {
    // The account no longer exists. Cookie clearing is best-effort here; the
    // deleted user's token cannot authorize public data because auth.uid()
    // no longer has an auth.users parent row and all owned rows were cascaded.
  }
  return { ok: true, redirectTo: "/login" };
}
