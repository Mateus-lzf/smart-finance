alter table public.import_runs
  add column idempotency_key uuid,
  add column request_hash text,
  add column result_project_version bigint,
  add column unchanged_count integer not null default 0,
  add column preserved_manual_count integer not null default 0,
  add column manual_overwrite_count integer not null default 0;

alter table public.import_runs
  add constraint import_runs_request_hash_length check (
    request_hash is null or request_hash ~ '^[0-9a-f]{64}$'
  ),
  add constraint import_runs_result_version_positive check (
    result_project_version is null or result_project_version >= 1
  ),
  add constraint import_runs_additional_counts_non_negative check (
    unchanged_count >= 0 and preserved_manual_count >= 0 and manual_overwrite_count >= 0
  );

create unique index import_runs_owner_idempotency_idx
  on public.import_runs (owner_user_id, idempotency_key)
  where idempotency_key is not null;

create function public.create_financial_transaction(p_project_id uuid, p_input jsonb)
returns setof public.transactions
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_owner uuid := auth.uid();
  v_project_version bigint;
  v_row public.transactions;
begin
  if v_owner is null then raise exception 'project_not_found'; end if;
  select version into v_project_version
    from public.projects
    where id = p_project_id and owner_user_id = v_owner
    for update;
  if not found then raise exception 'project_not_found'; end if;

  insert into public.transactions (
    project_id, owner_user_id, date, description, category, type, amount, origin,
    manually_modified, additional_data
  ) values (
    p_project_id, v_owner, (p_input->>'date')::date, p_input->>'description',
    p_input->>'category', p_input->>'type', (p_input->>'amount')::numeric,
    p_input->>'origin', false, coalesce(p_input->'additional_data', '{}'::jsonb)
  ) returning * into v_row;

  update public.projects set version = v_project_version + 1 where id = p_project_id;
  return next v_row;
end;
$$;

create function public.update_financial_transaction(
  p_project_id uuid,
  p_transaction_id uuid,
  p_expected_version bigint,
  p_input jsonb
)
returns setof public.transactions
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_owner uuid := auth.uid();
  v_project_version bigint;
  v_current public.transactions;
  v_row public.transactions;
begin
  if v_owner is null then raise exception 'project_not_found'; end if;
  select version into v_project_version from public.projects
    where id = p_project_id and owner_user_id = v_owner for update;
  if not found then raise exception 'project_not_found'; end if;

  select * into v_current from public.transactions
    where id = p_transaction_id and project_id = p_project_id and owner_user_id = v_owner
    for update;
  if not found then raise exception 'transaction_not_found'; end if;
  if v_current.version <> p_expected_version then raise exception 'transaction_conflict'; end if;

  update public.transactions set
    date = case when p_input ? 'date' then (p_input->>'date')::date else date end,
    description = case when p_input ? 'description' then p_input->>'description' else description end,
    category = case when p_input ? 'category' then p_input->>'category' else category end,
    type = case when p_input ? 'type' then p_input->>'type' else type end,
    amount = case when p_input ? 'amount' then (p_input->>'amount')::numeric else amount end,
    additional_data = case when p_input ? 'additional_data' then p_input->'additional_data' else additional_data end,
    manually_modified = manually_modified or origin = 'imported',
    version = version + 1
  where id = p_transaction_id
  returning * into v_row;

  update public.projects set version = v_project_version + 1 where id = p_project_id;
  return next v_row;
end;
$$;

create function public.delete_financial_transaction(
  p_project_id uuid,
  p_transaction_id uuid,
  p_expected_version bigint
)
returns boolean
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_owner uuid := auth.uid();
  v_project_version bigint;
  v_transaction_version bigint;
begin
  if v_owner is null then raise exception 'project_not_found'; end if;
  select version into v_project_version from public.projects
    where id = p_project_id and owner_user_id = v_owner for update;
  if not found then raise exception 'project_not_found'; end if;

  select version into v_transaction_version from public.transactions
    where id = p_transaction_id and project_id = p_project_id and owner_user_id = v_owner
    for update;
  if not found then raise exception 'transaction_not_found'; end if;
  if v_transaction_version <> p_expected_version then raise exception 'transaction_conflict'; end if;

  delete from public.transactions where id = p_transaction_id;
  update public.projects set version = v_project_version + 1 where id = p_project_id;
  return true;
end;
$$;

create function public.apply_initial_financial_import(
  p_idempotency_key uuid,
  p_request jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_owner uuid := auth.uid();
  v_hash text := encode(extensions.digest(convert_to(p_request::text, 'UTF8'), 'sha256'), 'hex');
  v_existing public.import_runs;
  v_project public.projects;
  v_run public.import_runs;
  v_duplicate_count integer;
begin
  if v_owner is null then raise exception 'project_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || p_idempotency_key::text, 0));
  select * into v_existing from public.import_runs
    where owner_user_id = v_owner and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_hash <> v_hash then raise exception 'idempotency_conflict'; end if;
    return jsonb_build_object(
      'projectId', v_existing.project_id, 'projectVersion', v_existing.result_project_version,
      'importRunId', v_existing.id, 'replayed', true, 'rowCount', v_existing.row_count,
      'addedCount', v_existing.added_count, 'changedCount', v_existing.changed_count,
      'removedCount', v_existing.removed_count, 'unchangedCount', v_existing.unchanged_count,
      'duplicateCount', v_existing.duplicate_count,
      'preservedManualCount', v_existing.preserved_manual_count,
      'manualOverwriteCount', v_existing.manual_overwrite_count
    );
  end if;

  if jsonb_typeof(p_request->'rows') <> 'array' or jsonb_array_length(p_request->'rows') not between 1 and 5000
     or pg_column_size(p_request) > 8388608 then raise exception 'import_limit_exceeded'; end if;

  select coalesce(sum(c), 0)::integer into v_duplicate_count
  from (select count(*) c from jsonb_array_elements(p_request->'rows') r group by r having count(*) > 1) d;
  if v_duplicate_count > 0 and coalesce((p_request->>'confirmPossibleDuplicates')::boolean, false) is not true then
    raise exception 'duplicate_confirmation_required';
  end if;

  insert into public.projects (owner_user_id, name, type, description)
  values (v_owner, p_request#>>'{project,name}', nullif(p_request#>>'{project,type}', ''),
          nullif(p_request#>>'{project,description}', '')) returning * into v_project;

  insert into public.import_runs (
    project_id, owner_user_id, operation, status, original_filename, file_hash,
    row_count, added_count, duplicate_count, idempotency_key, request_hash, base_project_version
  ) values (
    v_project.id, v_owner, 'initial', 'processing', p_request#>>'{file,originalFilename}',
    p_request#>>'{file,fileHash}', jsonb_array_length(p_request->'rows'),
    jsonb_array_length(p_request->'rows'), v_duplicate_count, p_idempotency_key, v_hash, null
  ) returning * into v_run;

  insert into public.transactions (
    project_id, owner_user_id, date, description, category, type, amount, origin,
    manually_modified, additional_data, import_run_id
  ) select v_project.id, v_owner, (r->>'date')::date, r->>'description', r->>'category',
           r->>'type', (r->>'amount')::numeric, 'imported', false,
           coalesce(r->'additional_data', '{}'::jsonb), v_run.id
    from jsonb_array_elements(p_request->'rows') r;

  insert into public.import_profiles (project_id, owner_user_id, headers, columns, mapping, schema_version)
  values (v_project.id, v_owner, p_request#>'{profile,headers}', p_request#>'{profile,columns}',
          p_request#>'{profile,mapping}', 1);

  update public.import_runs set status = 'completed', completed_at = now(), result_project_version = 1
    where id = v_run.id returning * into v_run;

  return jsonb_build_object(
    'projectId', v_project.id, 'projectVersion', 1, 'importRunId', v_run.id, 'replayed', false,
    'rowCount', v_run.row_count, 'addedCount', v_run.added_count, 'changedCount', 0,
    'removedCount', 0, 'unchangedCount', 0, 'duplicateCount', v_run.duplicate_count,
    'preservedManualCount', 0, 'manualOverwriteCount', 0
  );
exception when check_violation or foreign_key_violation or invalid_text_representation or numeric_value_out_of_range then
  raise exception 'invalid_import';
end;
$$;

create function public.apply_financial_import_update(
  p_project_id uuid,
  p_base_project_version bigint,
  p_idempotency_key uuid,
  p_request jsonb,
  p_plan jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_owner uuid := auth.uid();
  v_hash text := encode(extensions.digest(convert_to(p_request::text, 'UTF8'), 'sha256'), 'hex');
  v_existing public.import_runs;
  v_project_version bigint;
  v_run public.import_runs;
  v_item jsonb;
  v_current public.transactions;
  v_expected_count integer;
  v_actual_count integer;
  v_added integer := jsonb_array_length(coalesce(p_plan->'inserts', '[]'::jsonb));
  v_changed integer := jsonb_array_length(coalesce(p_plan->'updates', '[]'::jsonb));
  v_removed integer := jsonb_array_length(coalesce(p_plan->'deletes', '[]'::jsonb));
  v_duplicates integer;
  v_manuals integer;
  v_manual_overwrites integer := 0;
begin
  if v_owner is null then raise exception 'project_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || p_idempotency_key::text, 0));
  select * into v_existing from public.import_runs
    where owner_user_id = v_owner and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_hash <> v_hash then raise exception 'idempotency_conflict'; end if;
    return jsonb_build_object(
      'projectId', v_existing.project_id, 'projectVersion', v_existing.result_project_version,
      'importRunId', v_existing.id, 'replayed', true, 'rowCount', v_existing.row_count,
      'addedCount', v_existing.added_count, 'changedCount', v_existing.changed_count,
      'removedCount', v_existing.removed_count, 'unchangedCount', v_existing.unchanged_count,
      'duplicateCount', v_existing.duplicate_count,
      'preservedManualCount', v_existing.preserved_manual_count,
      'manualOverwriteCount', v_existing.manual_overwrite_count
    );
  end if;

  if jsonb_typeof(p_request->'rows') <> 'array' or jsonb_array_length(p_request->'rows') not between 1 and 5000
     or pg_column_size(p_request) > 8388608 then raise exception 'import_limit_exceeded'; end if;

  select version into v_project_version from public.projects
    where id = p_project_id and owner_user_id = v_owner for update;
  if not found then raise exception 'project_not_found'; end if;
  if v_project_version <> p_base_project_version then raise exception 'project_conflict'; end if;

  v_expected_count := jsonb_array_length(coalesce(p_plan->'expectedImported', '[]'::jsonb));
  select count(*) into v_actual_count from public.transactions
    where project_id = p_project_id and owner_user_id = v_owner and origin = 'imported';
  if v_actual_count <> v_expected_count or exists (
    select 1 from jsonb_array_elements(coalesce(p_plan->'expectedImported', '[]'::jsonb)) e
    left join public.transactions t on t.id = (e->>'id')::uuid and t.project_id = p_project_id
      and t.owner_user_id = v_owner and t.origin = 'imported' and t.version = (e->>'version')::bigint
    where t.id is null
  ) then raise exception 'project_conflict'; end if;

  select count(*) into v_manuals from public.transactions
    where project_id = p_project_id and owner_user_id = v_owner and origin = 'manual';

  for v_item in select value from jsonb_array_elements(coalesce(p_plan->'updates', '[]'::jsonb)) loop
    select * into v_current from public.transactions where id = (v_item->>'id')::uuid
      and project_id = p_project_id and owner_user_id = v_owner and origin = 'imported' for update;
    if not found or v_current.version <> (v_item->>'expectedVersion')::bigint then raise exception 'project_conflict'; end if;
    if v_current.manually_modified then v_manual_overwrites := v_manual_overwrites + 1; end if;
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(p_plan->'deletes', '[]'::jsonb)) loop
    select * into v_current from public.transactions where id = (v_item->>'id')::uuid
      and project_id = p_project_id and owner_user_id = v_owner and origin = 'imported' for update;
    if not found or v_current.version <> (v_item->>'expectedVersion')::bigint then raise exception 'project_conflict'; end if;
    if v_current.manually_modified then v_manual_overwrites := v_manual_overwrites + 1; end if;
  end loop;
  if v_manual_overwrites > 0 and coalesce((p_request->>'confirmManualOverwrite')::boolean, false) is not true then
    raise exception 'manual_confirmation_required';
  end if;

  insert into public.import_runs (
    project_id, owner_user_id, operation, status, original_filename, file_hash,
    row_count, added_count, changed_count, removed_count, unchanged_count,
    preserved_manual_count, manual_overwrite_count, idempotency_key, request_hash, base_project_version
  ) values (
    p_project_id, v_owner, 'update', 'processing', p_request#>>'{file,originalFilename}',
    p_request#>>'{file,fileHash}', jsonb_array_length(p_request->'rows'), v_added, v_changed,
    v_removed, greatest(v_expected_count - v_changed - v_removed, 0), v_manuals,
    v_manual_overwrites, p_idempotency_key, v_hash, p_base_project_version
  ) returning * into v_run;

  for v_item in select value from jsonb_array_elements(coalesce(p_plan->'updates', '[]'::jsonb)) loop
    update public.transactions set
      date = (v_item#>>'{row,date}')::date, description = v_item#>>'{row,description}',
      category = v_item#>>'{row,category}', type = v_item#>>'{row,type}',
      amount = (v_item#>>'{row,amount}')::numeric,
      additional_data = coalesce(v_item#>'{row,additional_data}', '{}'::jsonb),
      manually_modified = false, import_run_id = v_run.id, version = version + 1
    where id = (v_item->>'id')::uuid;
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(p_plan->'deletes', '[]'::jsonb)) loop
    delete from public.transactions where id = (v_item->>'id')::uuid and origin = 'imported';
    if not found then raise exception 'project_conflict'; end if;
  end loop;
  insert into public.transactions (
    project_id, owner_user_id, date, description, category, type, amount, origin,
    manually_modified, additional_data, import_run_id
  ) select p_project_id, v_owner, (r->>'date')::date, r->>'description', r->>'category',
           r->>'type', (r->>'amount')::numeric, 'imported', false,
           coalesce(r->'additional_data', '{}'::jsonb), v_run.id
    from jsonb_array_elements(coalesce(p_plan->'inserts', '[]'::jsonb)) r;

  insert into public.import_profiles (project_id, owner_user_id, headers, columns, mapping, schema_version)
  values (p_project_id, v_owner, p_request#>'{profile,headers}', p_request#>'{profile,columns}',
          p_request#>'{profile,mapping}', 1)
  on conflict (project_id) do update set headers = excluded.headers, columns = excluded.columns,
    mapping = excluded.mapping, schema_version = excluded.schema_version;

  update public.projects set version = p_base_project_version + 1 where id = p_project_id;
  select coalesce(sum(c), 0)::integer into v_duplicates from (
    select count(*) c from public.transactions where project_id = p_project_id
    group by date, lower(btrim(description)), lower(btrim(category)), type, amount, additional_data
    having count(*) > 1
  ) d;
  update public.import_runs set status = 'completed', completed_at = now(),
    duplicate_count = v_duplicates, result_project_version = p_base_project_version + 1
    where id = v_run.id returning * into v_run;

  return jsonb_build_object(
    'projectId', p_project_id, 'projectVersion', v_run.result_project_version,
    'importRunId', v_run.id, 'replayed', false, 'rowCount', v_run.row_count,
    'addedCount', v_run.added_count, 'changedCount', v_run.changed_count,
    'removedCount', v_run.removed_count, 'unchangedCount', v_run.unchanged_count,
    'duplicateCount', v_run.duplicate_count, 'preservedManualCount', v_run.preserved_manual_count,
    'manualOverwriteCount', v_run.manual_overwrite_count
  );
exception when check_violation or foreign_key_violation or invalid_text_representation or numeric_value_out_of_range then
  raise exception 'invalid_import';
end;
$$;

revoke all on function public.create_financial_transaction(uuid, jsonb) from public, anon;
revoke all on function public.update_financial_transaction(uuid, uuid, bigint, jsonb) from public, anon;
revoke all on function public.delete_financial_transaction(uuid, uuid, bigint) from public, anon;
revoke all on function public.apply_initial_financial_import(uuid, jsonb) from public, anon;
revoke all on function public.apply_financial_import_update(uuid, bigint, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.create_financial_transaction(uuid, jsonb) to authenticated;
grant execute on function public.update_financial_transaction(uuid, uuid, bigint, jsonb) to authenticated;
grant execute on function public.delete_financial_transaction(uuid, uuid, bigint) to authenticated;
grant execute on function public.apply_initial_financial_import(uuid, jsonb) to authenticated;
grant execute on function public.apply_financial_import_update(uuid, bigint, uuid, jsonb, jsonb) to authenticated;
