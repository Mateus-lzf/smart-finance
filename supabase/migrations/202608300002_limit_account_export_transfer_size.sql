create or replace function public.export_account_data_v1()
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $$
declare
  v_owner uuid := auth.uid();
  v_project_count bigint;
  v_transaction_count bigint;
  v_snapshot jsonb;
  -- Covers account identity supplied later by Auth, README, manifest, CSV
  -- headers/BOMs, separators and line endings. The variable portion below is
  -- an upper bound: each CSV field allows twice its UTF-8 source bytes plus
  -- three bytes for formula protection, quote doubling and enclosing quotes;
  -- JSON files use PostgreSQL's four-space pretty representation while the
  -- application uses two spaces.
  v_export_size_upper_bound bigint := 65536;
  v_export_size_limit constant bigint := 20971520;
begin
  if v_owner is null then
    raise exception using errcode = 'P0001', message = 'authentication_required';
  end if;

  select count(*) into v_project_count
  from public.projects project
  where project.owner_user_id = v_owner;

  select count(*) into v_transaction_count
  from public.transactions transaction
  where transaction.owner_user_id = v_owner;

  if v_project_count > 100
     or v_transaction_count > 25000
     or exists (
       select 1
       from public.transactions transaction
       where transaction.owner_user_id = v_owner
         and pg_catalog.octet_length(transaction.additional_data::text) > 262144
     ) then
    raise exception using errcode = 'P0001', message = 'export_limit_exceeded';
  end if;

  select v_export_size_upper_bound + coalesce(sum(
    (2 * pg_catalog.octet_length(project.id::text) + 3)
    + (2 * pg_catalog.octet_length(project.owner_user_id::text) + 3)
    + (2 * pg_catalog.octet_length(project.name) + 3)
    + (2 * pg_catalog.octet_length(coalesce(project.type, '')) + 3)
    + (2 * pg_catalog.octet_length(coalesce(project.description, '')) + 3)
    + (2 * pg_catalog.octet_length(project.version::text) + 3)
    + (2 * pg_catalog.octet_length(project.created_at::text) + 3)
    + (2 * pg_catalog.octet_length(project.updated_at::text) + 3)
    + 9
  ), 0)
  into v_export_size_upper_bound
  from public.projects project
  where project.owner_user_id = v_owner;

  select v_export_size_upper_bound + coalesce(sum(
    (2 * pg_catalog.octet_length(transaction.id::text) + 3)
    + (2 * pg_catalog.octet_length(transaction.project_id::text) + 3)
    + (2 * pg_catalog.octet_length(transaction.owner_user_id::text) + 3)
    + (2 * pg_catalog.octet_length(transaction.date::text) + 3)
    + (2 * pg_catalog.octet_length(transaction.description) + 3)
    + (2 * pg_catalog.octet_length(transaction.category) + 3)
    + (2 * pg_catalog.octet_length(transaction.type) + 3)
    + (2 * pg_catalog.octet_length(transaction.amount::text) + 3)
    + 9
    + (2 * pg_catalog.octet_length(transaction.origin) + 3)
    + (2 * pg_catalog.octet_length(transaction.manually_modified::text) + 3)
    + (2 * pg_catalog.octet_length(transaction.additional_data::text) + 3)
    + (2 * pg_catalog.octet_length(coalesce(transaction.import_run_id::text, '')) + 3)
    + (2 * pg_catalog.octet_length(transaction.version::text) + 3)
    + (2 * pg_catalog.octet_length(transaction.created_at::text) + 3)
    + (2 * pg_catalog.octet_length(transaction.updated_at::text) + 3)
    + 17
  ), 0)
  into v_export_size_upper_bound
  from public.transactions transaction
  where transaction.owner_user_id = v_owner;

  select v_export_size_upper_bound + coalesce(sum(
    (2 * pg_catalog.octet_length(run.id::text) + 3)
    + (2 * pg_catalog.octet_length(run.project_id::text) + 3)
    + (2 * pg_catalog.octet_length(run.owner_user_id::text) + 3)
    + (2 * pg_catalog.octet_length(run.operation) + 3)
    + (2 * pg_catalog.octet_length(run.status) + 3)
    + (2 * pg_catalog.octet_length(coalesce(run.original_filename, '')) + 3)
    + (2 * pg_catalog.octet_length(coalesce(run.file_hash, '')) + 3)
    + (2 * pg_catalog.octet_length(run.row_count::text) + 3)
    + (2 * pg_catalog.octet_length(run.added_count::text) + 3)
    + (2 * pg_catalog.octet_length(run.changed_count::text) + 3)
    + (2 * pg_catalog.octet_length(run.removed_count::text) + 3)
    + (2 * pg_catalog.octet_length(run.duplicate_count::text) + 3)
    + (2 * pg_catalog.octet_length(run.unchanged_count::text) + 3)
    + (2 * pg_catalog.octet_length(run.preserved_manual_count::text) + 3)
    + (2 * pg_catalog.octet_length(run.manual_overwrite_count::text) + 3)
    + (2 * pg_catalog.octet_length(coalesce(run.base_project_version::text, '')) + 3)
    + (2 * pg_catalog.octet_length(coalesce(run.result_project_version::text, '')) + 3)
    + (2 * pg_catalog.octet_length(coalesce(run.error_code, '')) + 3)
    + (2 * pg_catalog.octet_length(run.created_at::text) + 3)
    + (2 * pg_catalog.octet_length(coalesce(run.completed_at::text, '')) + 3)
    + 21
  ), 0)
  into v_export_size_upper_bound
  from public.import_runs run
  where run.owner_user_id = v_owner;

  select v_export_size_upper_bound
    + pg_catalog.octet_length(pg_catalog.jsonb_pretty(coalesce(
      pg_catalog.jsonb_agg(to_jsonb(profile) order by profile.project_id),
      '[]'::jsonb
    )))
  into v_export_size_upper_bound
  from public.import_profiles profile
  where profile.owner_user_id = v_owner;

  select v_export_size_upper_bound
    + pg_catalog.octet_length(pg_catalog.jsonb_pretty(coalesce(
      pg_catalog.jsonb_agg(to_jsonb(preference) order by preference.project_id, preference.user_id),
      '[]'::jsonb
    )))
  into v_export_size_upper_bound
  from public.project_preferences preference
  where preference.user_id = v_owner;

  select v_export_size_upper_bound
    + pg_catalog.octet_length(pg_catalog.jsonb_pretty(coalesce(
      (select to_jsonb(profile) from public.user_profiles profile where profile.user_id = v_owner),
      'null'::jsonb
    )))
  into v_export_size_upper_bound;

  if v_export_size_upper_bound > v_export_size_limit then
    raise exception using errcode = 'P0001', message = 'export_limit_exceeded';
  end if;

  select pg_catalog.jsonb_build_object(
    'profile', (
      select pg_catalog.jsonb_build_object(
        'display_name', profile.display_name,
        'locale', profile.locale,
        'created_at', profile.created_at,
        'updated_at', profile.updated_at
      )
      from public.user_profiles profile
      where profile.user_id = v_owner
    ),
    'projects', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', project.id,
          'owner_user_id', project.owner_user_id,
          'name', project.name,
          'type', project.type,
          'description', project.description,
          'version', project.version,
          'created_at', project.created_at,
          'updated_at', project.updated_at
        ) order by project.created_at, project.id
      )
      from public.projects project
      where project.owner_user_id = v_owner
    ), '[]'::jsonb),
    'transactions', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', transaction.id,
          'project_id', transaction.project_id,
          'owner_user_id', transaction.owner_user_id,
          'date', transaction.date,
          'description', transaction.description,
          'category', transaction.category,
          'type', transaction.type,
          'amount', transaction.amount::text,
          'origin', transaction.origin,
          'manually_modified', transaction.manually_modified,
          'additional_data', transaction.additional_data,
          'import_run_id', transaction.import_run_id,
          'version', transaction.version,
          'created_at', transaction.created_at,
          'updated_at', transaction.updated_at
        ) order by transaction.project_id, transaction.date, transaction.id
      )
      from public.transactions transaction
      where transaction.owner_user_id = v_owner
    ), '[]'::jsonb),
    'import_profiles', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'project_id', profile.project_id,
          'owner_user_id', profile.owner_user_id,
          'headers', profile.headers,
          'columns', profile.columns,
          'mapping', profile.mapping,
          'schema_version', profile.schema_version,
          'created_at', profile.created_at,
          'updated_at', profile.updated_at
        ) order by profile.project_id
      )
      from public.import_profiles profile
      where profile.owner_user_id = v_owner
    ), '[]'::jsonb),
    'import_runs', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', run.id,
          'project_id', run.project_id,
          'owner_user_id', run.owner_user_id,
          'operation', run.operation,
          'status', run.status,
          'original_filename', run.original_filename,
          'file_hash', run.file_hash,
          'row_count', run.row_count,
          'added_count', run.added_count,
          'changed_count', run.changed_count,
          'removed_count', run.removed_count,
          'duplicate_count', run.duplicate_count,
          'unchanged_count', run.unchanged_count,
          'preserved_manual_count', run.preserved_manual_count,
          'manual_overwrite_count', run.manual_overwrite_count,
          'base_project_version', run.base_project_version,
          'result_project_version', run.result_project_version,
          'error_code', run.error_code,
          'created_at', run.created_at,
          'completed_at', run.completed_at
        ) order by run.project_id, run.created_at, run.id
      )
      from public.import_runs run
      where run.owner_user_id = v_owner
    ), '[]'::jsonb),
    'project_preferences', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'project_id', preference.project_id,
          'user_id', preference.user_id,
          'visible_columns', preference.visible_columns,
          'analytical_dimensions', preference.analytical_dimensions,
          'version', preference.version,
          'created_at', preference.created_at,
          'updated_at', preference.updated_at
        ) order by preference.project_id, preference.user_id
      )
      from public.project_preferences preference
      where preference.user_id = v_owner
    ), '[]'::jsonb)
  ) into v_snapshot;

  return v_snapshot;
end;
$$;

revoke all on function public.export_account_data_v1() from public, anon;
grant execute on function public.export_account_data_v1() to authenticated;
