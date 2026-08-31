import type { SupabaseClient } from "@supabase/supabase-js";
import { classifySessionFailure } from "../auth/auth-functions";
import { createSupabaseServerClient } from "../supabase/server-client";
import type { Database } from "../supabase/database.types";
import { mapAccountExportV1 } from "./account-export-mapper";
import {
  ACCOUNT_EXPORT_V1_MAX_UNCOMPRESSED_BYTES,
  createAccountExportV1Files,
  createAccountExportV1ZipFromFiles,
  measureAccountExportV1Files,
  type AccountExportV1Files,
} from "./account-export-serializers";

type AccountExportClient = Pick<SupabaseClient<Database>, "auth" | "rpc">;

export type AccountExportDownloadError =
  | "authentication_required"
  | "export_limit_exceeded"
  | "rpc_denied"
  | "invalid_snapshot"
  | "unavailable"
  | "generation_failed";

export type AccountExportDownloadResult =
  | { ok: true; bytes: Uint8Array; fileName: string }
  | { ok: false; code: AccountExportDownloadError };

type AccountExportDownloadDependencies = {
  client?: AccountExportClient;
  generatedAt?: string;
  maxUncompressedBytes?: number;
  createFiles?: typeof createAccountExportV1Files;
  createZip?: typeof createAccountExportV1ZipFromFiles;
  measureFiles?: (files: AccountExportV1Files) => number;
};

function errorText(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const candidate = error as { code?: unknown; message?: unknown };
  return `${typeof candidate.code === "string" ? candidate.code : ""} ${
    typeof candidate.message === "string" ? candidate.message : ""
  }`.toLowerCase();
}

export async function generateAccountExportDownload(
  dependencies: AccountExportDownloadDependencies = {},
): Promise<AccountExportDownloadResult> {
  const client = dependencies.client ?? createSupabaseServerClient();
  const generatedAt = dependencies.generatedAt ?? new Date().toISOString();
  const createFiles = dependencies.createFiles ?? createAccountExportV1Files;
  const createZip = dependencies.createZip ?? createAccountExportV1ZipFromFiles;
  const measureFiles = dependencies.measureFiles ?? measureAccountExportV1Files;
  const maxUncompressedBytes =
    dependencies.maxUncompressedBytes ?? ACCOUNT_EXPORT_V1_MAX_UNCOMPRESSED_BYTES;

  let user;
  try {
    const authResult = await client.auth.getUser();
    if (authResult.error || !authResult.data.user) {
      if (!authResult.error) {
        return { ok: false, code: "authentication_required" };
      }
      return {
        ok: false,
        code:
          classifySessionFailure(authResult.error).status === "unavailable"
            ? "unavailable"
            : "authentication_required",
      };
    }
    user = authResult.data.user;
  } catch {
    return { ok: false, code: "unavailable" };
  }

  let snapshot: unknown;
  try {
    const rpcResult = await client.rpc("export_account_data_v1");
    if (rpcResult.error) {
      const normalized = errorText(rpcResult.error);
      if (normalized.includes("export_limit_exceeded")) {
        return { ok: false, code: "export_limit_exceeded" };
      }
      if (normalized.includes("permission denied") || normalized.includes("42501")) {
        return { ok: false, code: "rpc_denied" };
      }
      if (normalized.includes("authentication_required")) {
        return { ok: false, code: "authentication_required" };
      }
      return { ok: false, code: "unavailable" };
    }
    snapshot = rpcResult.data;
  } catch {
    return { ok: false, code: "unavailable" };
  }

  let files: AccountExportV1Files;
  try {
    const data = mapAccountExportV1(
      {
        id: user.id,
        email: user.email ?? null,
        email_confirmed_at: user.email_confirmed_at ?? null,
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
      snapshot,
    );
    files = createFiles(data, generatedAt);
  } catch {
    return { ok: false, code: "invalid_snapshot" };
  }

  if (measureFiles(files) > maxUncompressedBytes) {
    return { ok: false, code: "export_limit_exceeded" };
  }

  try {
    const archive = createZip(files, generatedAt);
    return { ok: true, bytes: archive.bytes, fileName: archive.fileName };
  } catch {
    return { ok: false, code: "generation_failed" };
  }
}
