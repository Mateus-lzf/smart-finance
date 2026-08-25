import { UnsupportedImportProfileVersionError } from "../imports/import-profile-mapper";
import { createSupabaseServerClient } from "../supabase/server-client";
import { mapRemoteWorkspaceSnapshot } from "./remote-workspace-mapper";
import type { WorkspaceFunctionResult } from "./remote-workspace-types";

export function createSupabaseWorkspaceStore() {
  return {
    async load(): Promise<WorkspaceFunctionResult> {
      try {
        const supabase = createSupabaseServerClient();
        const { data, error } = await supabase.rpc("load_financial_workspace");
        if (error) return { ok: false, code: "unavailable" };
        return { ok: true, data: mapRemoteWorkspaceSnapshot(data) };
      } catch (error) {
        if (error instanceof UnsupportedImportProfileVersionError) {
          return { ok: false, code: "unsupported_profile" };
        }
        return { ok: false, code: "invalid_snapshot" };
      }
    },
  };
}
