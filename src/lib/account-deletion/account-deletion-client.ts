export type AccountDeletionClientErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "INVALID_CONFIRMATION"
  | "INVALID_PASSWORD"
  | "REAUTHENTICATION_REQUIRED"
  | "REAUTHENTICATION_EXPIRED"
  | "REAUTHENTICATION_UNAVAILABLE"
  | "REQUEST_FORBIDDEN"
  | "UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "NETWORK";

export class AccountDeletionClientError extends Error {
  constructor(readonly code: AccountDeletionClientErrorCode) {
    super(code);
    this.name = "AccountDeletionClientError";
  }
}

type DeleteAccountDependencies = { fetch?: typeof fetch };

const serverErrorCodes: Record<string, AccountDeletionClientErrorCode> = {
  authentication_required: "AUTHENTICATION_REQUIRED",
  invalid_confirmation: "INVALID_CONFIRMATION",
  invalid_password: "INVALID_PASSWORD",
  password_reauthentication_required: "REAUTHENTICATION_REQUIRED",
  password_reauthentication_expired: "REAUTHENTICATION_EXPIRED",
  reauthentication_unavailable: "REAUTHENTICATION_UNAVAILABLE",
  request_forbidden: "REQUEST_FORBIDDEN",
  account_deletion_failed: "UNAVAILABLE",
};

async function readErrorCode(response: Response): Promise<AccountDeletionClientErrorCode> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error in serverErrorCodes) {
      return serverErrorCodes[body.error]!;
    }
  } catch {
    // A resposta publica continua sanitizada mesmo quando o corpo nao e JSON valido.
  }
  if (response.status === 401) return "AUTHENTICATION_REQUIRED";
  if (response.status === 403) return "REQUEST_FORBIDDEN";
  return "UNAVAILABLE";
}

export function canSubmitAccountDeletion(
  confirmation: string,
  password: string,
  submitting: boolean,
) {
  return confirmation === "EXCLUIR" && password.length > 0 && !submitting;
}

export async function deleteCurrentAccount(
  confirmation: string,
  password: string,
  dependencies: DeleteAccountDependencies = {},
): Promise<{ redirectTo: "/login" }> {
  const request = dependencies.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await request("/api/account/delete", {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation, password }),
    });
  } catch {
    throw new AccountDeletionClientError("NETWORK");
  }

  if (!response.ok) throw new AccountDeletionClientError(await readErrorCode(response));

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new AccountDeletionClientError("INVALID_RESPONSE");
  }
  if (
    result === null ||
    typeof result !== "object" ||
    (result as { ok?: unknown }).ok !== true ||
    (result as { redirectTo?: unknown }).redirectTo !== "/login"
  ) {
    throw new AccountDeletionClientError("INVALID_RESPONSE");
  }
  return { redirectTo: "/login" };
}
