import { createServerFn } from "@tanstack/react-start";
import { authenticatedServerFunctionMiddleware } from "./auth/auth-middleware";
import { resolveFinancialModeForUser } from "./financial-mode.server";

export const getFinancialMode = createServerFn({ method: "GET" })
  .middleware([authenticatedServerFunctionMiddleware])
  .handler(({ context }) => ({ mode: resolveFinancialModeForUser(context.user.id) }));
