import { createServerFn } from "@tanstack/react-start";
import { authenticatedServerFunctionMiddleware } from "../auth/auth-middleware";
import { createSupabaseWorkspaceStore } from "./supabase-workspace-store";

export const loadRemoteFinancialWorkspace = createServerFn({ method: "GET" })
  .middleware([authenticatedServerFunctionMiddleware])
  .handler(() => createSupabaseWorkspaceStore().load());
