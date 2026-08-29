import { createServerOnlyFn } from "@tanstack/react-start";
import type { FinancialModeResult } from "./financial-mode";

export type FinancialEnvironment = "development" | "test" | "staging" | "production";

export const resolveFinancialMode = createServerOnlyFn(
  (
    configuredEnvironment: string | undefined = process.env["SMART_FINANCE_ENVIRONMENT"],
  ): FinancialModeResult => {
    switch (configuredEnvironment?.trim()) {
      case "development":
      case "test":
        return { status: "resolved", mode: "local" };
      case "staging":
      case "production":
        return { status: "resolved", mode: "remote" };
      default:
        return { status: "unavailable" };
    }
  },
);
