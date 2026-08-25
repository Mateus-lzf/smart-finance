import { createServerOnlyFn } from "@tanstack/react-start";
import type { FinancialMode } from "./financial-mode";

const userIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const resolveFinancialModeForUser = createServerOnlyFn(
  (
    userId: string,
    configuredAllowlist: string | undefined = process.env["SMART_FINANCE_REMOTE_PILOT_USER_IDS"],
  ): FinancialMode => {
    if (!configuredAllowlist?.trim()) return "local";
    const values = configuredAllowlist.split(",").map((value: string) => value.trim());
    if (
      values.length > 100 ||
      values.some((value: string) => !userIdPattern.test(value)) ||
      new Set(values).size !== values.length
    ) {
      return "local";
    }
    return values.includes(userId) ? "remote" : "local";
  },
);
