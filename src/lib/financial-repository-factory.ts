import type { FinancialMode } from "./financial-mode";
import type { FinancialRepository } from "./financial-repository";
import { createLocalFinancialRepository } from "./local-financial-repository";

export type FinancialRepositoryFactories = {
  local(userId: string): FinancialRepository;
  remote(): Promise<FinancialRepository>;
};

const defaultFactories: FinancialRepositoryFactories = {
  local: (userId) => createLocalFinancialRepository(userId),
  remote: async () => {
    const { createRemoteFinancialRepository } = await import("./remote-financial-repository");
    return createRemoteFinancialRepository();
  },
};

export function createFinancialRepositoryForMode(
  mode: FinancialMode,
  userId: string,
  factories: FinancialRepositoryFactories = defaultFactories,
) {
  return mode === "remote" ? factories.remote() : Promise.resolve(factories.local(userId));
}
