import { createServerOnlyFn } from "@tanstack/react-start";
import { createSupabaseServerClient } from "../supabase/server-client";
import type {
  DeleteTransactionResult,
  GetTransactionResult,
  ListTransactionsResult,
  MutateTransactionResult,
  TransactionFunctionErrorCode,
} from "./transaction-function-types";
import {
  mapTransactionRow,
  transactionCreateInputToPersistence,
  transactionUpdateInputToPersistence,
} from "./transaction-mapper";
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

async function classifyMissingMutation(
  projectId: string,
  transactionId: string,
  ownerUserId: string,
  expectedVersion: number,
): Promise<TransactionFunctionErrorCode> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("version")
    .eq("id", transactionId)
    .eq("project_id", projectId)
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();
  if (error) return "unavailable";
  if (!data) return "transaction_not_found";
  return data.version !== expectedVersion ? "conflict" : "unavailable";
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
    ownerUserId: string,
    input: TransactionCreateInput,
  ): Promise<MutateTransactionResult> {
    const project = await ownedProjectExists(projectId, ownerUserId);
    if (!project.ok) return project;
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("transactions")
      .insert({
        ...transactionCreateInputToPersistence(input),
        project_id: projectId,
        owner_user_id: ownerUserId,
      })
      .select(TRANSACTION_COLUMNS)
      .single();
    if (error || !data) return { ok: false, code: "unavailable" };
    return unavailableOnMapping(() => mapTransactionRow(data));
  },

  async update(
    projectId: string,
    transactionId: string,
    ownerUserId: string,
    expectedVersion: number,
    input: TransactionUpdateInput,
  ): Promise<MutateTransactionResult> {
    const project = await ownedProjectExists(projectId, ownerUserId);
    if (!project.ok) return project;
    const supabase = createSupabaseServerClient();
    const { data: current, error: currentError } = await supabase
      .from("transactions")
      .select("version,origin")
      .eq("id", transactionId)
      .eq("project_id", projectId)
      .eq("owner_user_id", ownerUserId)
      .maybeSingle();
    if (currentError) return { ok: false, code: "unavailable" };
    if (!current) return { ok: false, code: "transaction_not_found" };
    if (current.version !== expectedVersion) return { ok: false, code: "conflict" };

    const { data, error } = await supabase
      .from("transactions")
      .update({
        ...transactionUpdateInputToPersistence(input, current.origin === "imported"),
        version: expectedVersion + 1,
      })
      .eq("id", transactionId)
      .eq("project_id", projectId)
      .eq("owner_user_id", ownerUserId)
      .eq("version", expectedVersion)
      .select(TRANSACTION_COLUMNS)
      .maybeSingle();
    if (error) return { ok: false, code: "unavailable" };
    if (data) return unavailableOnMapping(() => mapTransactionRow(data));
    return {
      ok: false,
      code: await classifyMissingMutation(projectId, transactionId, ownerUserId, expectedVersion),
    };
  },

  async delete(
    projectId: string,
    transactionId: string,
    ownerUserId: string,
    expectedVersion: number,
  ): Promise<DeleteTransactionResult> {
    const project = await ownedProjectExists(projectId, ownerUserId);
    if (!project.ok) return project;
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", transactionId)
      .eq("project_id", projectId)
      .eq("owner_user_id", ownerUserId)
      .eq("version", expectedVersion)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, code: "unavailable" };
    if (data) return { ok: true, data: null };
    return {
      ok: false,
      code: await classifyMissingMutation(projectId, transactionId, ownerUserId, expectedVersion),
    };
  },
}));
