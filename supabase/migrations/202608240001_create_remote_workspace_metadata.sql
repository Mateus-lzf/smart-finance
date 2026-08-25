alter table public.project_preferences
  add column version bigint not null default 1;

alter table public.project_preferences
  add constraint project_preferences_version_positive check (version >= 1);

create function public.update_project_preferences(
  p_project_id uuid,
  p_expected_version bigint,
  p_visible_columns jsonb,
  p_analytical_dimensions jsonb
)
returns setof public.project_preferences
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_owner uuid := auth.uid();
  v_current public.project_preferences;
  v_result public.project_preferences;
begin
  if v_owner is null then
    raise exception 'project_not_found';
  end if;

  perform 1
  from public.projects
  where id = p_project_id and owner_user_id = v_owner
  for key share;
  if not found then
    raise exception 'project_not_found';
  end if;

  if p_visible_columns is null
     or jsonb_typeof(p_visible_columns) <> 'array'
     or p_analytical_dimensions is null
     or jsonb_typeof(p_analytical_dimensions) <> 'array'
     or jsonb_array_length(p_analytical_dimensions) > 3
     or exists (
       select 1 from jsonb_array_elements(p_visible_columns) value
       where jsonb_typeof(value) <> 'string'
     )
     or exists (
       select 1 from jsonb_array_elements(p_analytical_dimensions) value
       where jsonb_typeof(value) <> 'string'
     )
     or (
       select count(*) from jsonb_array_elements_text(p_visible_columns)
     ) <> (
       select count(distinct value) from jsonb_array_elements_text(p_visible_columns) value
     )
     or (
       select count(*) from jsonb_array_elements_text(p_analytical_dimensions)
     ) <> (
       select count(distinct value) from jsonb_array_elements_text(p_analytical_dimensions) value
     ) then
    raise exception 'preferences_invalid';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(p_visible_columns) selected(value)
    where selected.value not in ('date', 'description', 'category', 'type', 'amount')
      and not exists (
        select 1
        from public.import_profiles profile
        cross join lateral jsonb_array_elements(profile.columns) column_value
        where profile.project_id = p_project_id
          and profile.owner_user_id = v_owner
          and column_value->>'id' = selected.value
          and not exists (
            select 1
            from jsonb_each_text(profile.mapping) mapped
            where mapped.value = selected.value
          )
      )
  ) then
    raise exception 'preferences_invalid';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(p_analytical_dimensions) selected(value)
    where not exists (
      select 1
      from public.import_profiles profile
      cross join lateral jsonb_array_elements(profile.columns) column_value
      where profile.project_id = p_project_id
        and profile.owner_user_id = v_owner
        and column_value->>'id' = selected.value
        and not exists (
          select 1
          from jsonb_each_text(profile.mapping) mapped
          where mapped.value = selected.value
        )
    )
  ) then
    raise exception 'preferences_invalid';
  end if;

  select * into v_current
  from public.project_preferences
  where project_id = p_project_id and user_id = v_owner
  for update;

  if found then
    if p_expected_version is null or p_expected_version <> v_current.version then
      raise exception 'preferences_conflict';
    end if;

    update public.project_preferences
    set visible_columns = p_visible_columns,
        analytical_dimensions = p_analytical_dimensions,
        version = version + 1
    where project_id = p_project_id and user_id = v_owner
    returning * into v_result;
  else
    if p_expected_version is not null then
      raise exception 'preferences_conflict';
    end if;

    insert into public.project_preferences (
      project_id,
      user_id,
      visible_columns,
      analytical_dimensions
    ) values (
      p_project_id,
      v_owner,
      p_visible_columns,
      p_analytical_dimensions
    )
    returning * into v_result;
  end if;

  return next v_result;
end;
$$;

create function public.load_financial_workspace()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null then
    raise exception 'authentication_required';
  end if;

  return jsonb_build_object(
    'projects', coalesce((
      select jsonb_agg(
        jsonb_build_object(
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
      select jsonb_agg(
        jsonb_build_object(
          'id', transaction.id,
          'project_id', transaction.project_id,
          'owner_user_id', transaction.owner_user_id,
          'date', transaction.date,
          'description', transaction.description,
          'category', transaction.category,
          'type', transaction.type,
          'amount', transaction.amount,
          'origin', transaction.origin,
          'manually_modified', transaction.manually_modified,
          'additional_data', transaction.additional_data,
          'import_run_id', transaction.import_run_id,
          'version', transaction.version,
          'created_at', transaction.created_at,
          'updated_at', transaction.updated_at
        ) order by transaction.project_id, transaction.date desc, transaction.id
      )
      from public.transactions transaction
      where transaction.owner_user_id = v_owner
    ), '[]'::jsonb),
    'import_profiles', coalesce((
      select jsonb_agg(
        jsonb_build_object(
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
    'project_preferences', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'project_id', preference.project_id,
          'user_id', preference.user_id,
          'visible_columns', preference.visible_columns,
          'analytical_dimensions', preference.analytical_dimensions,
          'version', preference.version,
          'created_at', preference.created_at,
          'updated_at', preference.updated_at
        ) order by preference.project_id
      )
      from public.project_preferences preference
      where preference.user_id = v_owner
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.update_project_preferences(uuid, bigint, jsonb, jsonb)
  from public, anon;
revoke all on function public.load_financial_workspace()
  from public, anon;

grant execute on function public.update_project_preferences(uuid, bigint, jsonb, jsonb)
  to authenticated;
grant execute on function public.load_financial_workspace()
  to authenticated;
