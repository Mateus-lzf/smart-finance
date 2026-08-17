import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseServerClient } from "../supabase/server-client";
import type { AuthResult } from "./auth-types";

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
});

const signupSchema = credentialsSchema.extend({
  displayName: z.string().trim().min(1).max(160).optional(),
});

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
      ...(data.displayName ? { options: { data: { display_name: data.displayName } } } : {}),
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
  await supabase.auth.signOut();
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
