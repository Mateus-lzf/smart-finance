import { createFileRoute } from "@tanstack/react-router";
import { handleAccountExportRequest } from "@/lib/account-export/account-export-http";

export const Route = createFileRoute("/api/account/export")({
  server: {
    handlers: {
      GET: ({ request }) => handleAccountExportRequest(request),
      POST: ({ request }) => handleAccountExportRequest(request),
    },
  },
});
