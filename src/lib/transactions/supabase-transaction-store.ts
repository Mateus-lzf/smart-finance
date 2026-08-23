import { createServerOnlyFn } from "@tanstack/react-start";
import { createSupabaseServerClient } from "../supabase/server-client";
import type { Json } from "../supabase/database.types";
import type {
  DeleteTransactionResult,
  GetTransactionResult,
  ListTransactionsResult,
  MutateTransactionResult,
  TransactionFunctionErrorCode,
} from "./transaction-function-types";
import { mapTransactionRow, transactionCreateInputToPersistence } from "./transaction-mapper";
import type { TransactionCreateInput, TransactionUpdateInput } from "./transaction-repository";

const TRANSACTION_COLUMNS =
  "id,project_id,owner_user_id,date,description,category,type,amount,origin,manually_modified,additional_data,import_run_id,version,created_at,updated_at";

async function ownedProjectExists(projectId: string, ownerUserId: string) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();
  if (error) return { ok: false as const, code: "unavailable" as const };
  if (!data) return { ok: false as const, code: "project_not_found" as const };
  return { ok: true as const };
}

function mutationError(message = ""): TransactionFunctionErrorCode {
  if (message.includes("project_not_found")) return "project_not_found";
  if (message.includes("transaction_not_found")) return "transaction_not_found";
  if (message.includes("transaction_conflict")) return "conflict";
  return "unavailable";
}

function unavailableOnMapping<T>(map: () => T) {
  try {
    return { ok: true as const, data: map() };
  } catch {
    return { ok: false as const, code: "unavailable" as const };
  }
}

export const createSupabaseTransactionStore = createServerOnlyFn(() => ({
  async list(projectId: string, ownerUserId: string): Promise<ListTransactionsResult> {
    const project = await ownedProjectExists(projectId, ownerUserId);
    if (!project.ok) return project;
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("transactions")
      .select(TRANSACTION_COLUMNS)
      .eq("project_id", projectId)
      .eq("owner_user_id", ownerUserId)
      .order("date", { ascending: false })
      .order("id", { ascending: true });
    if (error) return { ok: false, code: "unavailable" };
    return unavailableOnMapping(() => data.map(mapTransactionRow));
  },

  async get(
    projectId: string,
    transactionId: string,
    ownerUserId: string,
  ): Promise<GetTransactionResult> {
    const project = await ownedProjectExists(projectId, ownerUserId);
    if (!project.ok) return project;
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("transactions")
      .select(TRANSACTION_COLUMNS)
      .eq("id", transactionId)
      .eq("project_id", projectId)
      .eq("owner_user_id", ownerUserId)
      .maybeSingle();
    if (error) return { ok: false, code: "unavailable" };
    return unavailableOnMapping(() => (data ? mapTransactionRow(data) : null));
  },

  async create(
    projectId: string,
    _ownerUserId: string,
    input: TransactionCreateInput,
  ): Promise<MutateTransactionResult> {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .rpc("create_financial_transaction", {
        p_project_id: projectId,
        p_input: transactionCreateInputToPersistence(input) as unknown as Json,
      })
      .single();
    if (error || !data) return { ok: false, code: mutationError(error?.message) };
    return unavailableOnMapping(() => mapTransactionRow(data));
  },

  async update(
    projectId: string,
    transactionId: string,
    _ownerUserId: string,
    expectedVersion: number,
    input: TransactionUpdateInput,
  ): Promise<MutateTransactionResult> {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .rpc("update_financial_transaction", {
        p_project_id: projectId,
        p_transaction_id: transactionId,
        p_expected_version: expectedVersion,
        p_input: {
          ...(input.date !== undefined ? { date: input.date } : {}),
          ...(input.description !== undefined ? { description: input.description.trim() } : {}),
          ...(input.category !== undefined ? { category: input.category.trim() } : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.amount !== undefined ? { amount: input.amount } : {}),
          ...(input.additionalData !== undefined
            ? { additional_data: input.additionalData as Json }
            : {}),
        },
      })
      .single();
    if (error || !data) return { ok: false, code: mutationError(error?.message) };
    return unavailableOnMapping(() => mapTransactionRow(data));
  },

  async delete(
    projectId: string,
    transactionId: string,
    _ownerUserId: string,
    expectedVersion: number,
  ): Promise<DeleteTransactionResult> {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc("delete_financial_transaction", {
      p_project_id: projectId,
      p_transaction_id: transactionId,
      p_expected_version: expectedVersion,
    });
    if (error || data !== true) return { ok: false, code: mutationError(error?.message) };
    return { ok: true, data: null };
  },
}));
