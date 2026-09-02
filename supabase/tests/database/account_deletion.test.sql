begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(76);

select has_function('public', 'delete_current_account', array[]::text[], 'public wrapper exists');
select has_function('private', 'delete_current_account', array[]::text[], 'private helper exists');
select is(
  (select pronargs::integer from pg_catalog.pg_proc where oid = 'public.delete_current_account()'::regprocedure),
  0,
  'public wrapper accepts no arguments'
);
select is(
  (select pronargs::integer from pg_catalog.pg_proc where oid = 'private.delete_current_account()'::regprocedure),
  0,
  'private helper accepts no arguments'
);
select is(
  (select prorettype::regtype::text from pg_catalog.pg_proc where oid = 'public.delete_current_account()'::regprocedure),
  'boolean',
  'public wrapper returns boolean'
);
select is(
  (select prorettype::regtype::text from pg_catalog.pg_proc where oid = 'private.delete_current_account()'::regprocedure),
  'boolean',
  'private helper returns boolean'
);
select ok(
  (select prosecdef from pg_catalog.pg_proc where oid = 'public.delete_current_account()'::regprocedure),
  'public wrapper is security definer'
);
select ok(
  (select prosecdef from pg_catalog.pg_proc where oid = 'private.delete_current_account()'::regprocedure),
  'private helper is security definer'
);
select is(
  (select provolatile::text from pg_catalog.pg_proc where oid = 'public.delete_current_account()'::regprocedure),
  'v',
  'public wrapper is volatile'
);
select is(
  (select provolatile::text from pg_catalog.pg_proc where oid = 'private.delete_current_account()'::regprocedure),
  'v',
  'private helper is volatile'
);
select ok(
  (select proconfig @> array['search_path=pg_catalog'] from pg_catalog.pg_proc where oid = 'public.delete_current_account()'::regprocedure),
  'public wrapper hardens search_path'
);
select ok(
  (select proconfig @> array['search_path=pg_catalog'] from pg_catalog.pg_proc where oid = 'private.delete_current_account()'::regprocedure),
  'private helper hardens search_path'
);
select is(
  (select pg_catalog.pg_get_userbyid(proowner) from pg_catalog.pg_proc where oid = 'public.delete_current_account()'::regprocedure),
  'smart_finance_account_deletion_api',
  'technical role owns public wrapper'
);
select is(
  (select pg_catalog.pg_get_userbyid(proowner) from pg_catalog.pg_proc where oid = 'private.delete_current_account()'::regprocedure),
  'postgres',
  'postgres owns private helper'
);
select ok(
  exists (
    select 1 from pg_catalog.pg_roles
    where rolname = 'smart_finance_account_deletion_api'
      and not rolcanlogin and not rolinherit and not rolsuper
      and not rolcreatedb and not rolcreaterole and not rolreplication and not rolbypassrls
  ),
  'technical role is NOLOGIN NOINHERIT and has no administrative attributes'
);
select is(
  (select count(*)::integer
   from pg_catalog.pg_auth_members
   where member = 'smart_finance_account_deletion_api'::regrole),
  0,
  'technical role is not a member of any more privileged role'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_auth_members
    where roleid = 'smart_finance_account_deletion_api'::regrole
      and member = 'postgres'::regrole
      and admin_option
      and not inherit_option
      and not set_option
  ),
  'postgres retains administration only, with SET and INHERIT disabled'
);
select ok(
  not pg_catalog.pg_has_role('postgres', 'smart_finance_account_deletion_api', 'SET'),
  'postgres cannot SET ROLE to the technical role'
);
select ok(
  not pg_catalog.pg_has_role('postgres', 'smart_finance_account_deletion_api', 'USAGE'),
  'postgres does not inherit privileges from the technical role'
);

select ok(has_function_privilege('authenticated', 'public.delete_current_account()', 'execute'), 'authenticated can execute wrapper');
select ok(not has_function_privilege('anon', 'public.delete_current_account()', 'execute'), 'anon cannot execute wrapper');
select ok(
  not exists (
    select 1 from pg_catalog.pg_proc p,
      pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
    where p.oid = 'public.delete_current_account()'::regprocedure
      and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute wrapper'
);
select ok(not has_function_privilege('authenticated', 'private.delete_current_account()', 'execute'), 'authenticated cannot execute private helper');
select ok(not has_function_privilege('anon', 'private.delete_current_account()', 'execute'), 'anon cannot execute private helper');
select ok(
  not exists (
    select 1 from pg_catalog.pg_proc p,
      pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
    where p.oid = 'private.delete_current_account()'::regprocedure
      and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute private helper'
);
select ok(
  has_function_privilege('smart_finance_account_deletion_api', 'private.delete_current_account()', 'execute'),
  'technical role can execute only the private capability it needs'
);
select ok(
  not has_table_privilege('smart_finance_account_deletion_api', 'auth.users', 'select')
  and not has_table_privilege('smart_finance_account_deletion_api', 'auth.users', 'insert')
  and not has_table_privilege('smart_finance_account_deletion_api', 'auth.users', 'update')
  and not has_table_privilege('smart_finance_account_deletion_api', 'auth.users', 'delete'),
  'technical role has no direct auth.users privileges'
);
select ok(
  not has_table_privilege('smart_finance_account_deletion_api', 'public.user_profiles', 'select,insert,update,delete')
  and not has_table_privilege('smart_finance_account_deletion_api', 'public.projects', 'select,insert,update,delete')
  and not has_table_privilege('smart_finance_account_deletion_api', 'public.transactions', 'select,insert,update,delete')
  and not has_table_privilege('smart_finance_account_deletion_api', 'public.import_profiles', 'select,insert,update,delete')
  and not has_table_privilege('smart_finance_account_deletion_api', 'public.import_runs', 'select,insert,update,delete')
  and not has_table_privilege('smart_finance_account_deletion_api', 'public.project_preferences', 'select,insert,update,delete'),
  'technical role has no financial table privileges'
);
select is((select count(*)::integer from pg_catalog.pg_policy where polrelid = 'auth.users'::regclass), 0, 'auth.users received no custom policy');
select is((select pg_catalog.pg_get_userbyid(relowner) from pg_catalog.pg_class where oid = 'auth.users'::regclass), 'supabase_auth_admin', 'auth.users ownership is unchanged');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'auth.users'::regclass), 'auth.users RLS remains enabled');
select is(
  (select count(*)::integer from pg_catalog.pg_class where oid in (
    'public.user_profiles'::regclass, 'public.projects'::regclass,
    'public.transactions'::regclass, 'public.import_profiles'::regclass,
    'public.import_runs'::regclass, 'public.project_preferences'::regclass
  ) and relrowsecurity),
  6,
  'RLS remains enabled on all financial ownership tables'
);
select is(
  (select count(*)::integer from pg_catalog.pg_policy where polname in (
    'user_profiles_owner_access', 'projects_owner_access', 'transactions_owner_access',
    'import_profiles_owner_access', 'import_runs_owner_access', 'project_preferences_owner_access'
  )),
  6,
  'all financial ownership policies remain present'
);

select ok(
  pg_catalog.pg_get_functiondef('public.delete_current_account()'::regprocedure)
    ~ 'select private\.delete_current_account\(\)',
  'wrapper delegates only to the private helper'
);
select ok(
  pg_catalog.pg_get_functiondef('private.delete_current_account()'::regprocedure)
    ~ 'delete from auth\.users',
  'private helper contains the single approved auth.users delete'
);
select ok(
  pg_catalog.pg_get_functiondef('private.delete_current_account()'::regprocedure)
    ~ 'where id = v_user_id',
  'private helper targets only auth.uid derived identity'
);
select ok(
  pg_catalog.pg_get_functiondef('private.delete_current_account()'::regprocedure)
    !~* '\m(execute|format)\M',
  'private helper contains no dynamic SQL'
);
select ok(
  pg_catalog.pg_get_functiondef('private.delete_current_account()'::regprocedure)
    !~* '\m(insert|update|truncate|merge)\M',
  'private helper contains no other data mutation'
);
select is(
  (select count(*)::integer
   from pg_catalog.regexp_matches(
     pg_catalog.pg_get_functiondef('private.delete_current_account()'::regprocedure),
     '\mdelete\M', 'gi'
   )),
  1,
  'private helper contains exactly one DELETE statement'
);
select ok(
  pg_catalog.pg_get_functiondef('private.delete_current_account()'::regprocedure) !~* '\miat\M',
  'private helper never uses iat as reauthentication evidence'
);

insert into auth.users (id, aud, role, email) values
  ('a1c00000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'delete-a@example.test'),
  ('b1c00000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'delete-b@example.test'),
  ('c1c00000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'delete-boundary@example.test'),
  ('d1c00000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'delete-rollback@example.test');

insert into public.projects (id, owner_user_id, name) values
  ('a2c00000-0000-4000-8000-000000000001', 'a1c00000-0000-4000-8000-000000000001', 'A'),
  ('b2c00000-0000-4000-8000-000000000002', 'b1c00000-0000-4000-8000-000000000002', 'B'),
  ('d2c00000-0000-4000-8000-000000000004', 'd1c00000-0000-4000-8000-000000000004', 'Rollback');

insert into public.import_runs (id, project_id, owner_user_id, operation, status) values
  ('a3c00000-0000-4000-8000-000000000001', 'a2c00000-0000-4000-8000-000000000001', 'a1c00000-0000-4000-8000-000000000001', 'initial', 'completed'),
  ('b3c00000-0000-4000-8000-000000000002', 'b2c00000-0000-4000-8000-000000000002', 'b1c00000-0000-4000-8000-000000000002', 'initial', 'completed'),
  ('d3c00000-0000-4000-8000-000000000004', 'd2c00000-0000-4000-8000-000000000004', 'd1c00000-0000-4000-8000-000000000004', 'initial', 'completed');

insert into public.transactions (id, project_id, owner_user_id, date, description, category, type, amount, origin, import_run_id) values
  ('a4c00000-0000-4000-8000-000000000001', 'a2c00000-0000-4000-8000-000000000001', 'a1c00000-0000-4000-8000-000000000001', '2026-08-31', 'A', 'Teste', 'receita', 10, 'imported', 'a3c00000-0000-4000-8000-000000000001'),
  ('b4c00000-0000-4000-8000-000000000002', 'b2c00000-0000-4000-8000-000000000002', 'b1c00000-0000-4000-8000-000000000002', '2026-08-31', 'B', 'Teste', 'despesa', 20, 'imported', 'b3c00000-0000-4000-8000-000000000002'),
  ('d4c00000-0000-4000-8000-000000000004', 'd2c00000-0000-4000-8000-000000000004', 'd1c00000-0000-4000-8000-000000000004', '2026-08-31', 'Rollback', 'Teste', 'receita', 30, 'imported', 'd3c00000-0000-4000-8000-000000000004');

insert into public.import_profiles (project_id, owner_user_id, headers, columns, mapping) values
  ('a2c00000-0000-4000-8000-000000000001', 'a1c00000-0000-4000-8000-000000000001', '[]', '[]', '{}'),
  ('b2c00000-0000-4000-8000-000000000002', 'b1c00000-0000-4000-8000-000000000002', '[]', '[]', '{}'),
  ('d2c00000-0000-4000-8000-000000000004', 'd1c00000-0000-4000-8000-000000000004', '[]', '[]', '{}');

insert into public.project_preferences (project_id, user_id) values
  ('a2c00000-0000-4000-8000-000000000001', 'a1c00000-0000-4000-8000-000000000001'),
  ('b2c00000-0000-4000-8000-000000000002', 'b1c00000-0000-4000-8000-000000000002'),
  ('d2c00000-0000-4000-8000-000000000004', 'd1c00000-0000-4000-8000-000000000004');

set local role authenticated;

select set_config('request.jwt.claims', '{"role":"authenticated","amr":[{"method":"password","timestamp":1}]}', true);
select throws_ok('select public.delete_current_account()', 'P0001', 'account_deletion_authentication_required', 'missing auth.uid is rejected');

select set_config('request.jwt.claims', '{"sub":"a1c00000-0000-4000-8000-000000000001","role":"authenticated","amr":[{"method":"otp","timestamp":1}]}', true);
select throws_ok('select public.delete_current_account()', 'P0001', 'account_deletion_password_reauthentication_required', 'OTP is rejected');

select set_config('request.jwt.claims', '{"sub":"a1c00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok('select public.delete_current_account()', 'P0001', 'account_deletion_password_reauthentication_required', 'missing amr is rejected');

select set_config('request.jwt.claims', '{"sub":"a1c00000-0000-4000-8000-000000000001","role":"authenticated","amr":{"method":"password","timestamp":1}}', true);
select throws_ok('select public.delete_current_account()', 'P0001', 'account_deletion_password_reauthentication_required', 'malformed non-array amr is rejected');

select set_config('request.jwt.claims', '{"sub":"a1c00000-0000-4000-8000-000000000001","role":"authenticated","amr":[{"method":"password","timestamp":"invalid"}]}', true);
select throws_ok('select public.delete_current_account()', 'P0001', 'account_deletion_password_reauthentication_required', 'malformed password timestamp is rejected');

select set_config('request.jwt.claims', '{"sub":"a1c00000-0000-4000-8000-000000000001","role":"authenticated","amr":[{"method":"oauth","timestamp":1}]}', true);
select throws_ok('select public.delete_current_account()', 'P0001', 'account_deletion_password_reauthentication_required', 'OAuth without password is rejected');

select set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub','e1c00000-0000-4000-8000-000000000005','role','authenticated','amr',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('method','password','timestamp',pg_catalog.floor(pg_catalog.date_part('epoch',pg_catalog.statement_timestamp()))::bigint)))::text, true);
select throws_ok('select public.delete_current_account()', 'P0001', 'account_deletion_user_not_found', 'missing or concurrently deleted auth user is reported safely');

select set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub','a1c00000-0000-4000-8000-000000000001','role','authenticated','amr',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('method','password','timestamp',pg_catalog.floor(pg_catalog.date_part('epoch',pg_catalog.statement_timestamp()))::bigint - 301)))::text, true);
select throws_ok('select public.delete_current_account()', 'P0001', 'account_deletion_password_reauthentication_expired', 'password older than 300 seconds is rejected');

select set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub','a1c00000-0000-4000-8000-000000000001','role','authenticated','amr',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('method','password','timestamp',pg_catalog.floor(pg_catalog.date_part('epoch',pg_catalog.statement_timestamp()))::bigint + 1)))::text, true);
select throws_ok('select public.delete_current_account()', 'P0001', 'account_deletion_password_reauthentication_expired', 'future password timestamp is rejected');

select set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub','a1c00000-0000-4000-8000-000000000001','role','authenticated','iat',pg_catalog.floor(pg_catalog.date_part('epoch',pg_catalog.statement_timestamp()))::bigint,'amr',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('method','password','timestamp',pg_catalog.floor(pg_catalog.date_part('epoch',pg_catalog.statement_timestamp()))::bigint - 301)))::text, true);
select throws_ok('select public.delete_current_account()', 'P0001', 'account_deletion_password_reauthentication_expired', 'new iat cannot refresh an old password AMR');

select lives_ok(
  $$select public.delete_current_account()
    from (
      select set_config(
        'request.jwt.claims',
        pg_catalog.jsonb_build_object(
          'sub','c1c00000-0000-4000-8000-000000000003',
          'role','authenticated',
          'amr',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'method','password',
            'timestamp',pg_catalog.floor(pg_catalog.date_part('epoch',pg_catalog.statement_timestamp()))::bigint - 300
          ))
        )::text,
        true
      ) as claims
    ) boundary
    where boundary.claims is not null$$,
  'exactly 300 seconds is accepted'
);
reset role;
select is((select count(*) from auth.users where id = 'c1c00000-0000-4000-8000-000000000003'), 0::bigint, 'boundary user was deleted');

set local role authenticated;
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub','a1c00000-0000-4000-8000-000000000001','role','authenticated','amr',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('method','password','timestamp',pg_catalog.floor(pg_catalog.date_part('epoch',pg_catalog.statement_timestamp()))::bigint)))::text, true);
select is(public.delete_current_account(), true, 'recent password deletes current user A');

reset role;

select is((select count(*) from auth.users where id = 'a1c00000-0000-4000-8000-000000000001'), 0::bigint, 'A auth user is deleted');
select is((select count(*) from public.user_profiles where user_id = 'a1c00000-0000-4000-8000-000000000001'), 0::bigint, 'A profile cascades');
select is((select count(*) from public.projects where owner_user_id = 'a1c00000-0000-4000-8000-000000000001'), 0::bigint, 'A projects cascade');
select is((select count(*) from public.transactions where owner_user_id = 'a1c00000-0000-4000-8000-000000000001'), 0::bigint, 'A transactions cascade');
select is((select count(*) from public.import_profiles where owner_user_id = 'a1c00000-0000-4000-8000-000000000001'), 0::bigint, 'A import profiles cascade');
select is((select count(*) from public.import_runs where owner_user_id = 'a1c00000-0000-4000-8000-000000000001'), 0::bigint, 'A import runs cascade');
select is((select count(*) from public.project_preferences where user_id = 'a1c00000-0000-4000-8000-000000000001'), 0::bigint, 'A project preferences cascade');

select is((select count(*) from auth.users where id = 'b1c00000-0000-4000-8000-000000000002'), 1::bigint, 'B auth user remains');
select is((select count(*) from public.user_profiles where user_id = 'b1c00000-0000-4000-8000-000000000002'), 1::bigint, 'B profile remains');
select is((select count(*) from public.projects where owner_user_id = 'b1c00000-0000-4000-8000-000000000002'), 1::bigint, 'B project remains');
select is((select count(*) from public.transactions where owner_user_id = 'b1c00000-0000-4000-8000-000000000002'), 1::bigint, 'B transaction remains');
select is((select count(*) from public.import_profiles where owner_user_id = 'b1c00000-0000-4000-8000-000000000002'), 1::bigint, 'B import profile remains');
select is((select count(*) from public.import_runs where owner_user_id = 'b1c00000-0000-4000-8000-000000000002'), 1::bigint, 'B import run remains');
select is((select count(*) from public.project_preferences where user_id = 'b1c00000-0000-4000-8000-000000000002'), 1::bigint, 'B preference remains');

create function pg_temp.reject_account_deletion_test()
returns trigger language plpgsql as $$begin raise exception 'forced_test_rollback'; end$$;
create trigger account_deletion_forced_rollback
before delete on public.transactions
for each row execute function pg_temp.reject_account_deletion_test();

set local role authenticated;
select set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub','d1c00000-0000-4000-8000-000000000004','role','authenticated','amr',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('method','password','timestamp',pg_catalog.floor(pg_catalog.date_part('epoch',pg_catalog.statement_timestamp()))::bigint)))::text, true);
select throws_ok('select public.delete_current_account()', 'P0001', 'forced_test_rollback', 'failure inside cascade aborts account deletion');
reset role;

drop trigger account_deletion_forced_rollback on public.transactions;
select is((select count(*) from auth.users where id = 'd1c00000-0000-4000-8000-000000000004'), 1::bigint, 'rollback preserves auth user');
select is((select count(*) from public.projects where owner_user_id = 'd1c00000-0000-4000-8000-000000000004'), 1::bigint, 'rollback preserves project');
select is((select count(*) from public.transactions where owner_user_id = 'd1c00000-0000-4000-8000-000000000004'), 1::bigint, 'rollback preserves transaction');
select is((select count(*) from public.import_profiles where owner_user_id = 'd1c00000-0000-4000-8000-000000000004'), 1::bigint, 'rollback preserves import profile');
select is((select count(*) from public.import_runs where owner_user_id = 'd1c00000-0000-4000-8000-000000000004'), 1::bigint, 'rollback preserves import run');
select is((select count(*) from public.project_preferences where user_id = 'd1c00000-0000-4000-8000-000000000004'), 1::bigint, 'rollback preserves preference');

set local role anon;
select throws_ok('select public.delete_current_account()', '42501', null, 'anon cannot invoke wrapper');
reset role;

set local role authenticated;
select throws_ok('select private.delete_current_account()', '42501', null, 'authenticated cannot invoke private helper directly');
reset role;

select * from finish();
rollback;
