import { isSameOriginRequest } from "../http/same-origin";
import {
  generateAccountExportDownload,
  type AccountExportDownloadResult,
} from "./account-export-server";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
} as const;

type AccountExportHttpDependencies = {
  generateDownload?: () => Promise<AccountExportDownloadResult>;
};

function jsonError(status: number, error: string, additionalHeaders?: HeadersInit) {
  return Response.json(
    { error },
    {
      status,
      headers: { ...NO_STORE_HEADERS, ...Object.fromEntries(new Headers(additionalHeaders)) },
    },
  );
}

function mapDownloadError(result: Extract<AccountExportDownloadResult, { ok: false }>) {
  if (result.code === "authentication_required") {
    return jsonError(401, "authentication_required");
  }
  if (result.code === "export_limit_exceeded") {
    return jsonError(413, "export_limit_exceeded");
  }
  return jsonError(503, "export_unavailable");
}

export async function handleAccountExportRequest(
  request: Request,
  dependencies: AccountExportHttpDependencies = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonError(405, "method_not_allowed", { Allow: "POST" });
  }
  if (!isSameOriginRequest(request)) {
    return jsonError(403, "request_forbidden");
  }

  const generateDownload = dependencies.generateDownload ?? generateAccountExportDownload;
  let result: AccountExportDownloadResult;
  try {
    result = await generateDownload();
  } catch {
    return jsonError(503, "export_unavailable");
  }
  if (!result.ok) return mapDownloadError(result);

  const body = Uint8Array.from(result.bytes).buffer;
  return new Response(body, {
    status: 200,
    headers: {
      ...NO_STORE_HEADERS,
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${result.fileName}"`,
      "Content-Length": String(result.bytes.byteLength),
    },
  });
}
