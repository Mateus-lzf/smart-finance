import { createServerFn } from "@tanstack/react-start";
import { authenticatedServerFunctionMiddleware } from "../auth/auth-middleware";
import { createSupabaseImportStore } from "./supabase-import-store";
import type {
  InitialRemoteImportCommand,
  RemoteImportRow,
  UpdateRemoteImportCommand,
} from "./import-repository";
import {
  initialRemoteImportSchema,
  prepareRemoteImportSchema,
  updateRemoteImportSchema,
  validateImportPayloadSize,
  validateProfileRows,
} from "./import-validation";

function payloadValidator<T>(schema: { parse(value: unknown): T }) {
  return (value: unknown) => {
    if (!validateImportPayloadSize(value)) throw new Error("IMPORT_LIMIT_EXCEEDED");
    return schema.parse(value);
  };
}

export const prepareRemoteImportUpdate = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(payloadValidator(prepareRemoteImportSchema))
  .handler(({ data, context }) =>
    createSupabaseImportStore().prepare(
      data.projectId,
      context.user.id,
      data.rows as RemoteImportRow[],
    ),
  );

export const applyInitialRemoteImport = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(payloadValidator(initialRemoteImportSchema))
  .handler(({ data, context }) => {
    validateProfileRows(data.profile, data.rows);
    return createSupabaseImportStore().applyInitial(
      context.user.id,
      data as unknown as InitialRemoteImportCommand,
    );
  });

export const applyRemoteImportUpdate = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(payloadValidator(updateRemoteImportSchema))
  .handler(({ data, context }) => {
    validateProfileRows(data.profile, data.rows);
    return createSupabaseImportStore().applyUpdate(
      context.user.id,
      data as unknown as UpdateRemoteImportCommand,
    );
  });
