import { createFileRoute } from "@tanstack/react-router";
import { handleAccountDeletionRequest } from "@/lib/account-deletion/account-deletion-http";

export const Route = createFileRoute("/api/account/delete")({
  server: {
    handlers: {
      GET: ({ request }) => handleAccountDeletionRequest(request),
      POST: ({ request }) => handleAccountDeletionRequest(request),
    },
  },
});
