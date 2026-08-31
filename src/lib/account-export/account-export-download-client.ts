export const ACCOUNT_EXPORT_V1_FALLBACK_FILENAME = "smart-finance-export-v1.zip";

export type AccountExportClientErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "REQUEST_FORBIDDEN"
  | "LIMIT_EXCEEDED"
  | "UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "NETWORK";

export class AccountExportClientError extends Error {
  constructor(public readonly code: AccountExportClientErrorCode) {
    super("Account export download failed");
    this.name = "AccountExportClientError";
  }
}

type AccountExportBrowserDependencies = {
  fetch?: typeof fetch;
  createObjectURL?: typeof URL.createObjectURL;
  revokeObjectURL?: typeof URL.revokeObjectURL;
  document?: Pick<Document, "body" | "createElement">;
};

export function accountExportFileName(contentDisposition: string | null) {
  const match = contentDisposition?.match(
    /^attachment;\s*filename="(smart-finance-export-v1-\d{4}-\d{2}-\d{2}\.zip)"$/,
  );
  return match?.[1] ?? ACCOUNT_EXPORT_V1_FALLBACK_FILENAME;
}

function responseError(status: number): AccountExportClientError {
  if (status === 401) return new AccountExportClientError("AUTHENTICATION_REQUIRED");
  if (status === 403) return new AccountExportClientError("REQUEST_FORBIDDEN");
  if (status === 413) return new AccountExportClientError("LIMIT_EXCEEDED");
  return new AccountExportClientError("UNAVAILABLE");
}

export async function downloadAccountExport(
  dependencies: AccountExportBrowserDependencies = {},
): Promise<{ fileName: string }> {
  const fetchRequest = dependencies.fetch ?? fetch;
  let response: Response;
  try {
    response = await fetchRequest("/api/account/export", {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/zip" },
    });
  } catch {
    throw new AccountExportClientError("NETWORK");
  }

  if (!response.ok) throw responseError(response.status);
  const contentType = response.headers
    .get("content-type")
    ?.split(";", 1)
    .at(0)
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/zip") {
    throw new AccountExportClientError("INVALID_RESPONSE");
  }

  let blob: Blob;
  try {
    blob = await response.blob();
  } catch {
    throw new AccountExportClientError("INVALID_RESPONSE");
  }

  const browserDocument = dependencies.document ?? document;
  const createObjectURL = dependencies.createObjectURL ?? URL.createObjectURL.bind(URL);
  const revokeObjectURL = dependencies.revokeObjectURL ?? URL.revokeObjectURL.bind(URL);
  const fileName = accountExportFileName(response.headers.get("content-disposition"));
  const objectUrl = createObjectURL(blob);
  const anchor = browserDocument.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.hidden = true;
  browserDocument.body.appendChild(anchor);

  try {
    anchor.click();
  } finally {
    anchor.remove();
    revokeObjectURL(objectUrl);
  }

  return { fileName };
}
