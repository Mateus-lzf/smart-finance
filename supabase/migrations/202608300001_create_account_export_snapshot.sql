create function public.export_account_data_v1()
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

  return pg_catalog.jsonb_build_object(
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
  );
end;
$$;

revoke all on function public.export_account_data_v1() from public, anon;
grant execute on function public.export_account_data_v1() to authenticated;
