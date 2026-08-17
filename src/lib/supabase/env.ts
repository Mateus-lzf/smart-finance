import { z } from "zod";

const publicSupabaseEnvSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

export type PublicSupabaseEnv = z.infer<typeof publicSupabaseEnvSchema>;

export function readPublicSupabaseEnv(
  source: Record<string, string | boolean | undefined> = import.meta.env,
): PublicSupabaseEnv {
  const result = publicSupabaseEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error("A configuração pública do Supabase está ausente ou inválida.");
  }
  return result.data;
}
