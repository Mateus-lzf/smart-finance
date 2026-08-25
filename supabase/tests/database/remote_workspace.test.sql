begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(25);

insert into auth.users (id, aud, role, email) values
  ('e1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'workspace-a@example.test'),
  ('e1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'workspace-b@example.test'),
  ('e1000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'workspace-empty@example.test');

insert into public.projects (id, owner_user_id, name, version) values
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'Projeto A1', 3),
  ('e2000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', 'Projeto A2', 1),
  ('e2000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000002', 'Projeto B', 7);

insert into public.transactions (id, project_id, owner_user_id, date, description, category, type, amount, origin, version) values
  ('e3000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', '2026-08-01', 'A1', 'Teste', 'receita', 100, 'manual', 2),
  ('e3000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', '2026-08-02', 'A2', 'Teste', 'despesa', 20, 'manual', 1),
  ('e3000000-0000-0000-0000-000000000003', 'e2000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000002', '2026-08-03', 'B', 'Sigiloso B', 'receita', 50, 'manual', 4);

insert into public.import_profiles (project_id, owner_user_id, headers, columns, mapping) values (
  'e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001',
  '["Data","Descrição","Categoria","Tipo","Valor","Filial"]',
  '[{"id":"date","header":"Data","index":0},{"id":"description","header":"Descrição","index":1},{"id":"category","header":"Categoria","index":2},{"id":"type","header":"Tipo","index":3},{"id":"amount","header":"Valor","index":4},{"id":"branch","header":"Filial","index":5}]',
  '{"date":"date","description":"description","category":"category","type":"type","amount":"amount"}'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000001', true);

select is(jsonb_array_length(public.load_financial_workspace()->'projects'), 2, 'A sees both own projects');
select is(jsonb_array_length(public.load_financial_workspace()->'transactions'), 2, 'A sees transactions from both own projects');
select is(jsonb_array_length(public.load_financial_workspace()->'import_profiles'), 1, 'A sees present profile and accepts absent profile');
select is(jsonb_array_length(public.load_financial_workspace()->'project_preferences'), 0, 'workspace has no synthetic preference row');
select is((public.load_financial_workspace()->'projects'->0->>'version')::int, 3, 'snapshot includes project version');
select is((public.load_financial_workspace()->'transactions'->0->>'version')::int, 2, 'snapshot includes transaction version');
select ok(position('Sigiloso B' in (public.load_financial_workspace())::text) = 0, 'A snapshot contains no financial data from B');

select is((select version from public.update_project_preferences(
  'e2000000-0000-0000-0000-000000000001', null,
  '["date","description","branch"]', '["branch"]'
)), 1::bigint, 'first preference save inserts version one');
select is((select analytical_dimensions->>0 from public.project_preferences), 'branch', 'valid additional dimension is stored');
select is((select version from public.update_project_preferences(
  'e2000000-0000-0000-0000-000000000001', 1, '[]', '[]'
)), 2::bigint, 'subsequent preference save increments expected version');
select is((select visible_columns from public.project_preferences), '[]'::jsonb, 'explicit empty visible columns remain empty');
select throws_ok(
  $$select public.update_project_preferences('e2000000-0000-0000-0000-000000000001', 1, '[]', '[]')$$,
  'P0001', null, 'stale preference version conflicts');
select throws_ok(
  $$select public.update_project_preferences('e2000000-0000-0000-0000-000000000001', 2, '["unknown"]', '[]')$$,
  'P0001', null, 'unknown visible column is rejected');
select throws_ok(
  $$select public.update_project_preferences('e2000000-0000-0000-0000-000000000001', 2, '[]', '["branch","x","y","z"]')$$,
  'P0001', null, 'more than three dimensions is rejected');
select is((public.load_financial_workspace()->'project_preferences'->0->>'version')::int, 2, 'snapshot includes preference version');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000002', true);
select is(jsonb_array_length(public.load_financial_workspace()->'projects'), 1, 'B sees only own project');
select is(jsonb_array_length(public.load_financial_workspace()->'transactions'), 1, 'B sees only own transaction');
select ok(position('Projeto A1' in (public.load_financial_workspace())::text) = 0, 'B snapshot contains no project from A');
select throws_ok(
  $$select public.update_project_preferences('e2000000-0000-0000-0000-000000000001', null, '[]', '[]')$$,
  'P0001', null, 'B cannot write preferences for A project');

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select public.load_financial_workspace()$$, '42501', null, 'anonymous cannot execute workspace RPC');
select throws_ok(
  $$select public.update_project_preferences('e2000000-0000-0000-0000-000000000001', null, '[]', '[]')$$,
  '42501', null, 'anonymous cannot execute preference RPC');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000003', true);
select is(public.load_financial_workspace(), '{"projects": [], "transactions": [], "import_profiles": [], "project_preferences": []}'::jsonb, 'empty user receives a coherent empty workspace');

reset role;
delete from public.projects where id = 'e2000000-0000-0000-0000-000000000001';
select is((select count(*) from public.project_preferences where project_id = 'e2000000-0000-0000-0000-000000000001'), 0::bigint, 'project delete cascades preferences');
select is((select count(*) from public.import_profiles where project_id = 'e2000000-0000-0000-0000-000000000001'), 0::bigint, 'project delete cascades profile');
select is((select count(*) from public.transactions where project_id = 'e2000000-0000-0000-0000-000000000001'), 0::bigint, 'project delete cascades transactions');

select * from finish();
rollback;
