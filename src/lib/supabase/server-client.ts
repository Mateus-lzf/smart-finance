import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerOnlyFn } from "@tanstack/react-start";
import { getCookies, setCookie, setResponseHeader } from "@tanstack/react-start/server";
import type { Database } from "./database.types";
import { readPublicSupabaseEnv } from "./env";

export const createSupabaseServerClient = createServerOnlyFn((): SupabaseClient<Database> => {
  // Edge runtimes inject bindings per request. Reading process.env here keeps
  // Cloudflare runtime configuration separate from Vite's browser-time env.
  const env = readPublicSupabaseEnv(process.env);
  return createServerClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => Object.entries(getCookies()).map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        setResponseHeader("Cache-Control", "private, no-store");
        for (const { name, value, options } of cookies) {
          setCookie(name, value, options);
        }
      },
    },
  });
});
