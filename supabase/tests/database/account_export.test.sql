begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(41);

select has_function('public', 'export_account_data_v1', array[]::text[], 'export RPC exists');
select is(
  (select pronargs::integer from pg_catalog.pg_proc where oid = 'public.export_account_data_v1()'::regprocedure),
  0,
  'export RPC accepts no arguments'
);
select is(
  (select prorettype::regtype::text from pg_catalog.pg_proc where oid = 'public.export_account_data_v1()'::regprocedure),
  'jsonb',
  'export RPC returns jsonb'
);
select is(
  (select provolatile::text from pg_catalog.pg_proc where oid = 'public.export_account_data_v1()'::regprocedure),
  's',
  'export RPC is stable'
);
select is(
  (select prosecdef from pg_catalog.pg_proc where oid = 'public.export_account_data_v1()'::regprocedure),
  false,
  'export RPC is security invoker'
);
select ok(
  (select proconfig @> array['search_path=pg_catalog'] from pg_catalog.pg_proc where oid = 'public.export_account_data_v1()'::regprocedure),
  'export RPC hardens search_path'
);
select ok(
  has_function_privilege('authenticated', 'public.export_account_data_v1()', 'execute'),
  'authenticated can execute export RPC'
);
select ok(
  not has_function_privilege('anon', 'public.export_account_data_v1()', 'execute'),
  'anon cannot execute export RPC'
);
select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc p,
      pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
    where p.oid = 'public.export_account_data_v1()'::regprocedure
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute export RPC'
);
select is(
  (select count(*)::integer from pg_catalog.pg_class where oid in (
    'public.user_profiles'::regclass,
    'public.projects'::regclass,
    'public.transactions'::regclass,
    'public.import_profiles'::regclass,
    'public.import_runs'::regclass,
    'public.project_preferences'::regclass
  ) and relrowsecurity),
  6,
  'RLS remains enabled on every exported public table'
);
select ok(
  position('auth.users' in pg_get_functiondef('public.export_account_data_v1()'::regprocedure)) = 0,
  'export RPC never reads auth.users'
);
select ok(
  pg_get_functiondef('public.export_account_data_v1()'::regprocedure) !~* '\m(insert|update|delete)\M',
  'export RPC contains no data mutation'
);

insert into auth.users (id, aud, role, email, raw_user_meta_data) values
  ('a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'export-a@example.test', '{"display_name":"Export A"}'),
  ('b1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'export-b@example.test', '{"display_name":"Export B"}'),
  ('c1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'export-empty@example.test', '{}');

delete from public.user_profiles where user_id = 'c1000000-0000-4000-8000-000000000003';

insert into public.projects (id, owner_user_id, name, version, created_at) values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Projeto A1', 3, '2026-08-01T00:00:00Z'),
  ('a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'Projeto A2', 1, '2026-08-02T00:00:00Z'),
  ('b2000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'Projeto B sigiloso', 7, '2026-08-01T00:00:00Z');

insert into public.import_runs (
  id, project_id, owner_user_id, operation, status, original_filename, file_hash,
  row_count, added_count, unchanged_count, idempotency_key, request_hash,
  base_project_version, result_project_version, completed_at, created_at
) values
  ('a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'initial', 'completed', 'a.csv', repeat('a', 64), 1, 1, 0, 'a5000000-0000-4000-8000-000000000001', repeat('b', 64), 1, 2, '2026-08-03T00:00:00Z', '2026-08-03T00:00:00Z'),
  ('b4000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'initial', 'completed', 'b.csv', repeat('c', 64), 1, 1, 0, 'b5000000-0000-4000-8000-000000000002', repeat('d', 64), 1, 2, '2026-08-03T00:00:00Z', '2026-08-03T00:00:00Z');

insert into public.transactions (
  id, project_id, owner_user_id, date, description, category, type, amount, origin,
  manually_modified, additional_data, import_run_id, version
) values
  ('a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', '2026-08-10', 'Transação A1', 'Teste', 'receita', 4451.01, 'imported', true, '{"texto":"Olá","numero":12.5,"ativo":true,"vazio":null}', 'a4000000-0000-4000-8000-000000000001', 2),
  ('a3000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', '2026-08-09', 'Transação A2', 'Teste', 'despesa', 20.60, 'manual', false, '{}', null, 1),
  ('b3000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', '2026-08-08', 'Transação B sigilosa', 'Segredo', 'receita', 50.00, 'imported', false, '{}', 'b4000000-0000-4000-8000-000000000002', 4);

insert into public.import_profiles (project_id, owner_user_id, headers, columns, mapping) values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', '["Data","Extra"]', '[{"id":"extra","header":"Extra","index":1}]', '{"date":"Data"}'),
  ('b2000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', '["Data"]', '[]', '{"date":"Data"}');

insert into public.project_preferences (
  project_id, user_id, visible_columns, analytical_dimensions, version
) values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', '[]', '["extra"]', 2),
  ('b2000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', '["date"]', '[]', 1);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
create temp table account_export_snapshots (owner text primary key, snapshot jsonb);
insert into account_export_snapshots values ('a', public.export_account_data_v1());

select is((select snapshot#>>'{profile,display_name}' from account_export_snapshots where owner = 'a'), 'Export A', 'A receives own profile');
select is((select jsonb_array_length(snapshot->'projects') from account_export_snapshots where owner = 'a'), 2, 'A receives both own projects');
select is((select jsonb_array_length(snapshot->'transactions') from account_export_snapshots where owner = 'a'), 2, 'A receives own transactions');
select is((select jsonb_array_length(snapshot->'import_profiles') from account_export_snapshots where owner = 'a'), 1, 'A receives present profile only');
select is((select jsonb_array_length(snapshot->'import_runs') from account_export_snapshots where owner = 'a'), 1, 'A receives own import run');
select is((select jsonb_array_length(snapshot->'project_preferences') from account_export_snapshots where owner = 'a'), 1, 'A receives own preference');
select is((select jsonb_typeof(snapshot#>'{transactions,0,amount}') from account_export_snapshots where owner = 'a'), 'string', 'amount crosses JSON as text');
select is((select snapshot#>>'{transactions,0,amount}' from account_export_snapshots where owner = 'a'), '4451.01', 'amount preserves numeric precision');
select is((select snapshot#>>'{transactions,0,date}' from account_export_snapshots where owner = 'a'), '2026-08-10', 'date-only remains unchanged');
select is((select jsonb_typeof(snapshot#>'{transactions,0,additional_data,texto}') from account_export_snapshots where owner = 'a'), 'string', 'additional data preserves string');
select is((select jsonb_typeof(snapshot#>'{transactions,0,additional_data,numero}') from account_export_snapshots where owner = 'a'), 'number', 'additional data preserves number');
select is((select jsonb_typeof(snapshot#>'{transactions,0,additional_data,ativo}') from account_export_snapshots where owner = 'a'), 'boolean', 'additional data preserves boolean');
select is((select jsonb_typeof(snapshot#>'{transactions,0,additional_data,vazio}') from account_export_snapshots where owner = 'a'), 'null', 'additional data preserves null');
select ok(not ((select snapshot->'import_runs'->0 from account_export_snapshots where owner = 'a') ? 'idempotency_key'), 'idempotency key is excluded');
select ok(not ((select snapshot->'import_runs'->0 from account_export_snapshots where owner = 'a') ? 'request_hash'), 'request hash is excluded');
select is((select snapshot#>>'{projects,0,name}' from account_export_snapshots where owner = 'a'), 'Projeto A1', 'projects are deterministically ordered');
select is((select snapshot#>>'{transactions,0,description}' from account_export_snapshots where owner = 'a'), 'Transação A1', 'transactions are deterministically ordered');
select is((select snapshot#>>'{import_runs,0,file_hash}' from account_export_snapshots where owner = 'a'), repeat('a', 64), 'approved file hash is exported');
select is((select snapshot#>'{project_preferences,0,visible_columns}' from account_export_snapshots where owner = 'a'), '[]'::jsonb, 'explicit empty preference array is preserved');
select ok(position('sigiloso' in lower((select snapshot::text from account_export_snapshots where owner = 'a'))) = 0, 'A snapshot contains no B marker');
select ok(position('example.test' in (select snapshot::text from account_export_snapshots where owner = 'a')) = 0, 'RPC contains no Auth email');
select is(
  (select count(*)::integer from account_export_snapshots, lateral pg_catalog.jsonb_object_keys(snapshot) where owner = 'a'),
  6,
  'snapshot contains exactly the six approved public sections'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000002', true);
insert into account_export_snapshots values ('b', public.export_account_data_v1());
select is((select jsonb_array_length(snapshot->'projects') from account_export_snapshots where owner = 'b'), 1, 'B receives only own project');
select ok(position('Projeto A' in (select snapshot::text from account_export_snapshots where owner = 'b')) = 0, 'B snapshot contains no A marker');
select ok(position('Projeto B sigiloso' in (select snapshot::text from account_export_snapshots where owner = 'b')) > 0, 'B snapshot contains own marker');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000003', true);
select is(public.export_account_data_v1()->'profile', 'null'::jsonb, 'missing profile is represented as null');
select is(
  public.export_account_data_v1() - 'profile',
  '{"projects":[],"transactions":[],"import_profiles":[],"import_runs":[],"project_preferences":[]}'::jsonb,
  'empty account receives coherent empty collections'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select public.export_account_data_v1()$$, '42501', null, 'anonymous cannot execute export RPC');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select public.export_account_data_v1()$$, 'P0001', 'authentication_required', 'authenticated role without identity fails closed');

select * from finish();
rollback;
