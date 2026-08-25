import type { PreferenceFunctionResult } from "./preference-function-types";
import {
  getRemoteProjectPreferences,
  updateRemoteProjectPreferences,
} from "./preference-functions";
import {
  ProjectPreferencesRepositoryError,
  type ProjectPreferencesInput,
  type ProjectPreferencesRepository,
  type ProjectPreferencesRepositoryErrorCode,
} from "./project-preferences-repository";

export type RemotePreferenceGateway = {
  get(data: { projectId: string }): Promise<PreferenceFunctionResult>;
  update(data: {
    projectId: string;
    expectedVersion: number | null;
    visibleColumns: string[];
    analyticDimensions: string[];
  }): Promise<PreferenceFunctionResult>;
};

const defaultGateway: RemotePreferenceGateway = {
  get: (data) => getRemoteProjectPreferences({ data }),
  update: (data) => updateRemoteProjectPreferences({ data }),
};

const codes = {
  project_not_found: "PROJECT_NOT_FOUND",
  conflict: "PREFERENCES_CONFLICT",
  invalid: "PREFERENCES_INVALID",
  unavailable: "PREFERENCES_UNAVAILABLE",
} as const satisfies Record<string, ProjectPreferencesRepositoryErrorCode>;

function unwrap(result: PreferenceFunctionResult) {
  if (result.ok) return result.data;
  const code = codes[result.code];
  throw new ProjectPreferencesRepositoryError(
    code,
    code === "PREFERENCES_CONFLICT"
      ? "As prefer�ncias foram alteradas em outra sess�o. Recarregue antes de tentar novamente."
      : code === "PREFERENCES_INVALID"
        ? "As colunas ou dimens�es selecionadas n�o s�o v�lidas para este projeto."
        : code === "PROJECT_NOT_FOUND"
          ? "O projeto n�o est� dispon�vel."
          : "N�o foi poss�vel acessar as prefer�ncias agora.",
  );
}

export class RemoteProjectPreferencesRepository implements ProjectPreferencesRepository {
  constructor(private readonly gateway: RemotePreferenceGateway = defaultGateway) {}

  async getProjectPreferences(projectId: string) {
    return unwrap(await this.gateway.get({ projectId }));
  }

  async updateProjectPreferences(
    projectId: string,
    expectedVersion: number | null,
    input: ProjectPreferencesInput,
  ) {
    return unwrap(
      await this.gateway.update({
        projectId,
        expectedVersion,
        visibleColumns: input.visibleColumns,
        analyticDimensions: input.analyticDimensions,
      }),
    );
  }
}
