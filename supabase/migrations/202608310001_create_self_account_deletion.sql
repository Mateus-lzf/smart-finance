do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'smart_finance_account_deletion_api'
  ) then
    create role smart_finance_account_deletion_api
      nologin
      noinherit
      nosuperuser
      nocreatedb
      nocreaterole
      noreplication
      nobypassrls;
  end if;
end;
$$;

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create function private.delete_current_account()
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_amr jsonb := auth.jwt()->'amr';
  v_factor jsonb;
  v_password_timestamp numeric;
  v_now_epoch bigint := pg_catalog.floor(
    pg_catalog.date_part('epoch', pg_catalog.statement_timestamp())
  )::bigint;
  v_deleted_count integer;
begin
  if v_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'account_deletion_authentication_required';
  end if;

  if v_amr is null or pg_catalog.jsonb_typeof(v_amr) <> 'array' then
    raise exception using
      errcode = 'P0001',
      message = 'account_deletion_password_reauthentication_required';
  end if;

  for v_factor in
    select factor.value
    from pg_catalog.jsonb_array_elements(v_amr) as factor(value)
  loop
    if v_factor->>'method' = 'password'
       and pg_catalog.jsonb_typeof(v_factor->'timestamp') = 'number' then
      v_password_timestamp := greatest(
        v_password_timestamp,
        (v_factor->>'timestamp')::numeric
      );
    end if;
  end loop;

  if v_password_timestamp is null then
    raise exception using
      errcode = 'P0001',
      message = 'account_deletion_password_reauthentication_required';
  end if;

  if v_password_timestamp < v_now_epoch - 300
     or v_password_timestamp > v_now_epoch then
    raise exception using
      errcode = 'P0001',
      message = 'account_deletion_password_reauthentication_expired';
  end if;

  delete from auth.users
  where id = v_user_id;

  get diagnostics v_deleted_count = row_count;

  if v_deleted_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'account_deletion_user_not_found';
  end if;

  return true;
end;
$$;

revoke all on function private.delete_current_account() from public, anon, authenticated;

grant usage on schema private to smart_finance_account_deletion_api;
grant execute on function private.delete_current_account()
  to smart_finance_account_deletion_api;

create function public.delete_current_account()
returns boolean
language sql
volatile
security definer
set search_path = pg_catalog
as $$
  select private.delete_current_account();
$$;

revoke all on function public.delete_current_account() from public, anon, authenticated;
grant execute on function public.delete_current_account() to authenticated;

comment on function public.delete_current_account() is
  'Deletes only the current auth.uid() after PostgreSQL verifies a password AMR no older than 300 seconds.';

comment on function private.delete_current_account() is
  'Private privileged helper for atomic self-account deletion; it accepts no caller-controlled identity.';

grant create on schema public to smart_finance_account_deletion_api;
grant smart_finance_account_deletion_api to postgres;
alter function public.delete_current_account()
  owner to smart_finance_account_deletion_api;
revoke smart_finance_account_deletion_api from postgres;
revoke create on schema public from smart_finance_account_deletion_api;
