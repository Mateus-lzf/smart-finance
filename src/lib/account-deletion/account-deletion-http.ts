import { z } from "zod";
import { isSameOriginRequest } from "../http/same-origin";
import { deleteAuthenticatedAccount, type AccountDeletionResult } from "./account-deletion-server";

const requestSchema = z
  .object({
    confirmation: z.literal("EXCLUIR"),
    password: z.string().min(1).max(128),
  })
  .strict();

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
} as const;

type AccountDeletionHttpDependencies = {
  deleteAccount?: (password: string) => Promise<AccountDeletionResult>;
};

function jsonResponse(status: number, body: object, additionalHeaders?: HeadersInit) {
  return Response.json(body, {
    status,
    headers: { ...NO_STORE_HEADERS, ...Object.fromEntries(new Headers(additionalHeaders)) },
  });
}

function mapDeletionError(result: Extract<AccountDeletionResult, { ok: false }>) {
  if (result.code === "authentication_required") {
    return jsonResponse(401, { error: "authentication_required" });
  }
  if (result.code === "invalid_password") {
    return jsonResponse(401, { error: "invalid_password" });
  }
  if (result.code === "password_reauthentication_required") {
    return jsonResponse(409, { error: "password_reauthentication_required" });
  }
  if (result.code === "password_reauthentication_expired") {
    return jsonResponse(409, { error: "password_reauthentication_expired" });
  }
  if (
    result.code === "reauthentication_unavailable" ||
    result.code === "reauthentication_mismatch"
  ) {
    return jsonResponse(503, { error: "reauthentication_unavailable" });
  }
  return jsonResponse(503, { error: "account_deletion_failed" });
}

export async function handleAccountDeletionRequest(
  request: Request,
  dependencies: AccountDeletionHttpDependencies = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" }, { Allow: "POST" });
  }
  if (!isSameOriginRequest(request)) {
    return jsonResponse(403, { error: "request_forbidden" });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return jsonResponse(400, { error: "invalid_request" });
  }
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    const invalidConfirmation =
      input !== null &&
      typeof input === "object" &&
      "confirmation" in input &&
      (input as { confirmation?: unknown }).confirmation !== "EXCLUIR";
    return jsonResponse(400, {
      error: invalidConfirmation ? "invalid_confirmation" : "invalid_request",
    });
  }

  const deleteAccount = dependencies.deleteAccount ?? deleteAuthenticatedAccount;
  let result: AccountDeletionResult;
  try {
    result = await deleteAccount(parsed.data.password);
  } catch {
    return jsonResponse(503, { error: "account_deletion_failed" });
  }
  if (!result.ok) return mapDeletionError(result);
  return jsonResponse(200, { ok: true, redirectTo: result.redirectTo });
}
