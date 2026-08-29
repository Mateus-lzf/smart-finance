import { createServerFn } from "@tanstack/react-start";
import { authenticatedServerFunctionMiddleware } from "./auth/auth-middleware";
import { resolveFinancialMode } from "./financial-mode.server";

export const getFinancialMode = createServerFn({ method: "GET" })
  .middleware([authenticatedServerFunctionMiddleware])
  .handler(() => resolveFinancialMode());
