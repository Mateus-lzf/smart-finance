begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(18);

insert into auth.users (id, aud, role, email)
values
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'schema-a@example.test'),
  ('10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'schema-b@example.test');

insert into public.projects (id, owner_user_id, name)
values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Projeto válido'
);

select throws_ok(
  $$insert into public.projects (owner_user_id, name) values ('10000000-0000-0000-0000-000000000001', '   ')$$,
  '23514', null, 'project name cannot be blank'
);

select throws_ok(
  $$insert into public.projects (owner_user_id, name, version) values ('10000000-0000-0000-0000-000000000001', 'Version', 0)$$,
  '23514', null, 'project version must be positive'
);

select throws_ok(
  $$insert into public.transactions (project_id, owner_user_id, date, description, category, type, amount, origin) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-08-01', 'Venda', 'Vendas', 'credito', 10, 'manual')$$,
  '23514', null, 'transaction type is constrained'
);

select throws_ok(
  $$insert into public.transactions (project_id, owner_user_id, date, description, category, type, amount, origin) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-08-01', 'Venda', 'Vendas', 'receita', 10, 'external')$$,
  '23514', null, 'transaction origin is constrained'
);

select throws_ok(
  $$insert into public.transactions (project_id, owner_user_id, date, description, category, type, amount, origin) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-08-01', 'Venda', 'Vendas', 'receita', 0, 'manual')$$,
  '23514', null, 'zero amount is rejected'
);

select throws_ok(
  $$insert into public.transactions (project_id, owner_user_id, date, description, category, type, amount, origin) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-08-01', 'Venda', 'Vendas', 'receita', -10, 'manual')$$,
  '23514', null, 'negative amount is rejected'
);

select throws_ok(
  $$insert into public.transactions (project_id, owner_user_id, date, description, category, type, amount, origin, version) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-08-01', 'Venda', 'Vendas', 'receita', 10, 'manual', 0)$$,
  '23514', null, 'transaction version must be positive'
);

select throws_ok(
  $$insert into public.transactions (project_id, owner_user_id, date, description, category, type, amount, origin, additional_data) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-08-01', 'Venda', 'Vendas', 'receita', 10, 'manual', '[1, 2]'::jsonb)$$,
  '23514', null, 'additional data must be a JSON object'
);

select lives_ok(
  $$insert into public.transactions (project_id, owner_user_id, date, description, category, type, amount, origin, additional_data) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-08-01', 'Venda', 'Vendas', 'receita', 1234.56, 'imported', '{"Texto":"PIX","Número":12.5,"Booleano":true,"Vazio":null,"Data de competência":"2026-08-01"}'::jsonb)$$,
  'additional data accepts current imported value types'
);

select is(
  (select additional_data ->> 'Data de competência' from public.transactions limit 1),
  '2026-08-01',
  'additional calendar dates remain date-only strings'
);

select throws_ok(
  $$insert into public.import_profiles (project_id, owner_user_id, headers, columns, mapping) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '{}'::jsonb, '[]'::jsonb, '{}'::jsonb)$$,
  '23514', null, 'import profile headers must be an array'
);

select lives_ok(
  $$insert into public.import_profiles (project_id, owner_user_id, headers, columns, mapping) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '["Data", "Valor"]'::jsonb, '[{"id":"column:data:1","header":"Data","index":0}]'::jsonb, '{"date":"column:data:1"}'::jsonb)$$,
  'valid import profile metadata is accepted'
);

select throws_ok(
  $$insert into public.project_preferences (project_id, user_id, analytical_dimensions) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '["a", "b", "c", "d"]'::jsonb)$$,
  '23514', null, 'analytical dimensions are limited to three'
);

select throws_ok(
  $$insert into public.import_runs (project_id, owner_user_id, operation, status) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'append', 'pending')$$,
  '23514', null, 'import operation is constrained'
);

select throws_ok(
  $$insert into public.import_runs (project_id, owner_user_id, operation, status) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'initial', 'unknown')$$,
  '23514', null, 'import status is constrained'
);

select throws_ok(
  $$insert into public.import_runs (project_id, owner_user_id, operation, row_count) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'initial', -1)$$,
  '23514', null, 'import counts cannot be negative'
);

select throws_ok(
  $$insert into public.transactions (project_id, owner_user_id, date, description, category, type, amount, origin) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '2026-08-01', 'Inválida', 'Teste', 'despesa', 10, 'manual')$$,
  '23503', null, 'transaction owner must match project owner'
);

select throws_ok(
  $$insert into public.transactions (project_id, owner_user_id, date, description, category, type, amount, origin) values ('29999999-0000-0000-0000-000000000999', '10000000-0000-0000-0000-000000000001', '2026-08-01', 'Inválida', 'Teste', 'despesa', 10, 'manual')$$,
  '23503', null, 'transaction project must exist'
);

select * from finish();
rollback;
