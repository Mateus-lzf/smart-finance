export type FinancialMode = "local" | "remote";

export type FinancialModeResult =
  | { status: "resolved"; mode: FinancialMode }
  | {
      status: "unavailable";
    };
