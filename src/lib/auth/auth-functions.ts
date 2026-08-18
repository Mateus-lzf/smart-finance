import { createServerFn } from "@tanstack/react-start";
import { getCookies, getRequestUrl } from "@tanstack/react-start/server";
import { z } from "zod";
import { createSupabaseServerClient } from "../supabase/server-client";
import { authenticatedServerFunctionMiddleware } from "./auth-middleware";
import { sanitizeInternalRedirect } from "./safe-redirect";
import type { AuthActionResult, AuthResult, AuthState } from "./auth-types";

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
});

const signupSchema = credentialsSchema.extend({
  displayName: z.string().trim().min(1).max(160).optional(),
  next: z.string().max(2048).optional(),
});

const emailSchema = z.object({
  email: z.string().trim().email().max(254),
});

const emailWithNextSchema = emailSchema.extend({ next: z.string().max(2048).optional() });

const authCodeSchema = z.object({
  code: z.string().min(1).max(4096),
  flowId: z.string().min(1).max(512).optional(),
});

const passwordSchema = z.object({ password: z.string().min(8).max(128) });

function callbackUrl(next: string): string {
  const url = new URL("/auth/callback", getRequestUrl().origin);
  url.searchParams.set("next", sanitizeInternalRedirect(next));
  return url.toString();
}

function sanitizedAuthFailure(message: string): AuthResult {
  const normalized = message.toLowerCase();
  if (normalized.includes("email not confirmed")) {
    return { ok: false, code: "email_not_confirmed" };
  }
  if (normalized.includes("invalid login credentials")) {
    return { ok: false, code: "invalid_credentials" };
  }
  return { ok: false, code: "unavailable" };
}

export const signUp = createServerFn({ method: "POST" })
  .validator(signupSchema)
  .handler(async ({ data }): Promise<AuthResult> => {
    const supabase = createSupabaseServerClient();
    const credentials = {
      email: data.email,
      password: data.password,
      options: {
        emailRedirectTo: callbackUrl(data.next ?? "/dashboard"),
        ...(data.displayName ? { data: { display_name: data.displayName } } : {}),
      },
    };
    const { data: result, error } = await supabase.auth.signUp(credentials);
    if (error || !result.user) return sanitizedAuthFailure(error?.message ?? "unavailable");
    return { ok: true, user: { id: result.user.id, email: result.user.email ?? null } };
  });

export const signIn = createServerFn({ method: "POST" })
  .validator(credentialsSchema)
  .handler(async ({ data }): Promise<AuthResult> => {
    const supabase = createSupabaseServerClient();
    const { data: result, error } = await supabase.auth.signInWithPassword(data);
    if (error || !result.user) return sanitizedAuthFailure(error?.message ?? "unavailable");
    return { ok: true, user: { id: result.user.id, email: result.user.email ?? null } };
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false as const, code: "unavailable" as const };
  return { ok: true as const };
});

export const getCurrentUser = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
});

export const refreshCurrentSession = createServerFn({ method: "POST" }).handler(async () => {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
});

export function classifySessionFailure(error: unknown, hadSessionCookie = false): AuthState {
  if (!error || typeof error !== "object") return { status: "unavailable" };
  const candidate = error as { name?: string; code?: string; status?: number; message?: string };
  const name = candidate.name?.toLowerCase() ?? "";
  const code = candidate.code?.toLowerCase() ?? "";
  const message = candidate.message?.toLowerCase() ?? "";

  if (name.includes("retryable") || name.includes("fetch") || candidate.status === 0) {
    return { status: "unavailable" };
  }
  if (message.includes("expired") || code.includes("expired")) {
    return { status: "unauthenticated", reason: "expired" };
  }
  if (
    name.includes("sessionmissing") ||
    code.includes("session_not_found") ||
    message.includes("auth session missing")
  ) {
    return { status: "unauthenticated", reason: hadSessionCookie ? "invalid" : "missing" };
  }
  if ([400, 401, 403].includes(candidate.status ?? 0)) {
    return { status: "unauthenticated", reason: "invalid" };
  }
  return { status: "unavailable" };
}

export const getAuthState = createServerFn({ method: "GET" }).handler(
  async (): Promise<AuthState> => {
    try {
      const hadSessionCookie = Object.keys(getCookies()).some((name) =>
        /^sb-.*-auth-token(?:\.\d+)?$/.test(name),
      );
      const supabase = createSupabaseServerClient();
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return classifySessionFailure(error, hadSessionCookie);
      return {
        status: "authenticated",
        user: { id: data.user.id, email: data.user.email ?? null },
      };
    } catch (error) {
      return classifySessionFailure(error);
    }
  },
);

export const resendSignupConfirmation = createServerFn({ method: "POST" })
  .validator(emailWithNextSchema)
  .handler(async ({ data }): Promise<AuthActionResult> => {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: data.email,
      options: { emailRedirectTo: callbackUrl(data.next ?? "/dashboard") },
    });
    return error ? { ok: false, code: "unavailable" } : { ok: true };
  });

export const requestPasswordRecovery = createServerFn({ method: "POST" })
  .validator(emailSchema)
  .handler(async ({ data }): Promise<AuthActionResult> => {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: callbackUrl("/redefinir-senha"),
    });
    return error ? { ok: false, code: "unavailable" } : { ok: true };
  });

export const exchangeAuthCode = createServerFn({ method: "POST" })
  .validator(authCodeSchema)
  .handler(async ({ data }): Promise<AuthActionResult> => {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(
      data.code,
      data.flowId ? { flowId: data.flowId } : undefined,
    );
    if (!error) return { ok: true };
    return classifySessionFailure(error).status === "unavailable"
      ? { ok: false, code: "unavailable" }
      : { ok: false, code: "invalid_or_expired" };
  });

export const updateRecoveredPassword = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(passwordSchema)
  .handler(async ({ data }): Promise<AuthActionResult> => {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({ password: data.password });
    return error ? { ok: false, code: "unavailable" } : { ok: true };
  });
