begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(36);

insert into auth.users (id, aud, role, email)
values
  ('a1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'import-a@example.test'),
  ('b1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'import-b@example.test');

create function public.test_reject_import_profile()
returns trigger language plpgsql as $$
begin
  if new.mapping ? 'force' then raise exception 'forced_import_failure'; end if;
  return new;
end;
$$;
create trigger test_reject_import_profile_trigger
before insert or update on public.import_profiles
for each row execute function public.test_reject_import_profile();

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
create temp table import_results (name text primary key, result jsonb);

insert into import_results values (
  'initial',
  public.apply_initial_financial_import(
    'a2000000-0000-0000-0000-000000000001',
    jsonb_build_object(
      'project', jsonb_build_object('name', 'Importação A'),
      'file', jsonb_build_object('originalFilename', 'dados.csv', 'fileHash', repeat('a', 64)),
      'profile', jsonb_build_object(
        'headers', '["Data","Descrição","Categoria","Tipo","Valor"]'::jsonb,
        'columns', '[{"id":"date","header":"Data","index":0},{"id":"description","header":"Descrição","index":1},{"id":"category","header":"Categoria","index":2},{"id":"type","header":"Tipo","index":3},{"id":"amount","header":"Valor","index":4}]'::jsonb,
        'mapping', '{"date":"date","description":"description","category":"category","type":"type","amount":"amount"}'::jsonb
      ),
      'rows', '[{"date":"2026-08-01","description":"Venda","category":"Vendas","type":"receita","amount":100,"additional_data":{"filial":"Fortaleza"}},{"date":"2026-08-01","description":"Venda","category":"Vendas","type":"receita","amount":100,"additional_data":{"filial":"Fortaleza"}}]'::jsonb,
      'confirmPossibleDuplicates', true
    )
  )
);

select is((select result->>'replayed' from import_results where name = 'initial'), 'false', 'initial import is not a replay');
select is((select (result->>'projectVersion')::int from import_results where name = 'initial'), 1, 'initial project starts at version one');
select is((select count(*) from public.projects where name = 'Importação A'), 1::bigint, 'initial import creates one project');
select is((select count(*) from public.transactions), 2::bigint, 'legitimate identical rows remain two occurrences');
select is((select count(distinct id) from public.transactions), 2::bigint, 'identical occurrences receive distinct ids');
select is((select count(*) from public.import_profiles), 1::bigint, 'profile commits with the import');
select is((select count(*) from public.import_runs where status = 'completed'), 1::bigint, 'only a completed run is visible');
select is((select duplicate_count from public.import_runs), 2, 'duplicate counter represents both occurrences');

insert into import_results values (
  'replay',
  public.apply_initial_financial_import(
    'a2000000-0000-0000-0000-000000000001',
    jsonb_build_object(
      'project', jsonb_build_object('name', 'Importação A'),
      'file', jsonb_build_object('originalFilename', 'dados.csv', 'fileHash', repeat('a', 64)),
      'profile', jsonb_build_object(
        'headers', '["Data","Descrição","Categoria","Tipo","Valor"]'::jsonb,
        'columns', '[{"id":"date","header":"Data","index":0},{"id":"description","header":"Descrição","index":1},{"id":"category","header":"Categoria","index":2},{"id":"type","header":"Tipo","index":3},{"id":"amount","header":"Valor","index":4}]'::jsonb,
        'mapping', '{"date":"date","description":"description","category":"category","type":"type","amount":"amount"}'::jsonb
      ),
      'rows', '[{"date":"2026-08-01","description":"Venda","category":"Vendas","type":"receita","amount":100,"additional_data":{"filial":"Fortaleza"}},{"date":"2026-08-01","description":"Venda","category":"Vendas","type":"receita","amount":100,"additional_data":{"filial":"Fortaleza"}}]'::jsonb,
      'confirmPossibleDuplicates', true
    )
  )
);
select is((select result->>'replayed' from import_results where name = 'replay'), 'true', 'same key and command returns the committed result');
select is((select count(*) from public.transactions), 2::bigint, 'idempotent replay creates no extra rows');
select throws_ok(
  $$select public.apply_initial_financial_import('a2000000-0000-0000-0000-000000000001', '{"project":{"name":"Outro"},"rows":[]}'::jsonb)$$,
  'P0001', null, 'same key with another command is rejected'
);

insert into import_results values (
  'manual',
  to_jsonb((select t from public.create_financial_transaction(
    (select (result->>'projectId')::uuid from import_results where name = 'initial'),
    '{"date":"2026-08-01","description":"Venda","category":"Vendas","type":"receita","amount":100,"origin":"manual","additional_data":{"filial":"Fortaleza"}}'::jsonb
  ) t))
);
select is((select version from public.projects), 2::bigint, 'unit transaction CRUD invalidates the import snapshot once');

insert into import_results values (
  'update',
  public.apply_financial_import_update(
    (select id from public.projects), 2, 'a2000000-0000-0000-0000-000000000002',
    jsonb_build_object(
      'projectId', (select id from public.projects), 'baseProjectVersion', 2,
      'file', jsonb_build_object('originalFilename', 'dados-2.csv', 'fileHash', repeat('b', 64)),
      'profile', jsonb_build_object('headers', '["Data","Descrição","Categoria","Tipo","Valor","Filial"]'::jsonb,
        'columns', '[{"id":"date","header":"Data","index":0},{"id":"description","header":"Descrição","index":1},{"id":"category","header":"Categoria","index":2},{"id":"type","header":"Tipo","index":3},{"id":"amount","header":"Valor","index":4},{"id":"branch","header":"Filial","index":5}]'::jsonb,
        'mapping', '{"date":"date","description":"description","category":"category","type":"type","amount":"amount"}'::jsonb),
      'rows', '[{"date":"2026-08-01","description":"Venda","category":"Vendas","type":"receita","amount":100,"additional_data":{"filial":"Fortaleza"}},{"date":"2026-08-02","description":"Taxa","category":"Taxas","type":"despesa","amount":10,"additional_data":{}}]'::jsonb,
      'confirmPossibleDuplicates', true, 'confirmManualOverwrite', false
    ),
    jsonb_build_object(
      'expectedImported', (select jsonb_agg(jsonb_build_object('id', id, 'version', version) order by id) from public.transactions where origin = 'imported'),
      'updates', '[]'::jsonb,
      'deletes', jsonb_build_array((select jsonb_build_object('id', id, 'expectedVersion', version) from public.transactions where origin = 'imported' order by id limit 1)),
      'inserts', '[{"date":"2026-08-02","description":"Taxa","category":"Taxas","type":"despesa","amount":10,"additional_data":{}}]'::jsonb
    )
  )
);
select is((select version from public.projects), 3::bigint, 'batch import increments project version exactly once');
select is((select count(*) from public.transactions where origin = 'manual'), 1::bigint, 'manual transaction is preserved');
select is((select count(*) from public.transactions where origin = 'imported'), 2::bigint, 'update replaces only the intended imported occurrence');
select is((select headers->>-1 from public.import_profiles), 'Filial', 'profile changes only with successful import');
select is((select added_count from public.import_runs where operation = 'update'), 1, 'run stores applied added count');
select is((select removed_count from public.import_runs where operation = 'update'), 1, 'run stores applied removed count');

select throws_ok(
  $$select public.apply_financial_import_update((select id from public.projects), 2, 'a2000000-0000-0000-0000-000000000003', '{"rows":[{}]}'::jsonb, '{"expectedImported":[],"updates":[],"deletes":[],"inserts":[]}'::jsonb)$$,
  'P0001', null, 'stale base project version is rejected'
);
select is((select count(*) from public.import_runs), 2::bigint, 'conflict leaves no partial run');

select * from public.update_financial_transaction(
  (select id from public.projects),
  (select id from public.transactions where origin = 'imported' and description = 'Venda'),
  1,
  '{"amount":110}'::jsonb
);
select is((select version from public.projects), 4::bigint, 'manual edit of imported row invalidates snapshot');
select ok((select manually_modified from public.transactions where description = 'Venda' and origin = 'imported'), 'imported edit is marked server-side');
select throws_ok(
  $$select public.apply_financial_import_update(
    (select id from public.projects), 4, 'a2000000-0000-0000-0000-000000000004',
    jsonb_build_object(
      'projectId', (select id from public.projects), 'baseProjectVersion', 4,
      'file', jsonb_build_object('originalFilename', 'dados-3.csv', 'fileHash', repeat('c', 64)),
      'profile', jsonb_build_object(
        'headers', (select headers from public.import_profiles),
        'columns', (select columns from public.import_profiles),
        'mapping', (select mapping from public.import_profiles)
      ),
      'rows', '[{"date":"2026-08-01","description":"Venda","category":"Vendas","type":"receita","amount":100,"additional_data":{"filial":"Fortaleza"}},{"date":"2026-08-02","description":"Taxa","category":"Taxas","type":"despesa","amount":10,"additional_data":{}}]'::jsonb,
      'confirmPossibleDuplicates', true, 'confirmManualOverwrite', false
    ),
    jsonb_build_object(
      'expectedImported', (select jsonb_agg(jsonb_build_object('id', id, 'version', version)) from public.transactions where origin = 'imported'),
      'updates', jsonb_build_array(jsonb_build_object(
        'id', (select id from public.transactions where description = 'Venda' and origin = 'imported'),
        'expectedVersion', (select version from public.transactions where description = 'Venda' and origin = 'imported'),
        'row', jsonb_build_object('date','2026-08-01','description','Venda','category','Vendas','type','receita','amount',100,'additional_data',jsonb_build_object('filial','Fortaleza'))
      )), 'deletes', '[]'::jsonb, 'inserts', '[]'::jsonb
    )
  )$$,
  'P0001', null, 'manually edited imported row requires explicit confirmation'
);
select is((select count(*) from public.import_runs), 2::bigint, 'missing manual confirmation leaves no run');

insert into import_results
select 'manual-confirmed', public.apply_financial_import_update(
  p.id, 4, 'a2000000-0000-0000-0000-000000000005',
  jsonb_build_object(
    'projectId', p.id, 'baseProjectVersion', 4,
    'file', jsonb_build_object('originalFilename', 'dados-3.csv', 'fileHash', repeat('c', 64)),
    'profile', jsonb_build_object('headers', ip.headers, 'columns', ip.columns, 'mapping', ip.mapping),
    'rows', '[{"date":"2026-08-01","description":"Venda","category":"Vendas","type":"receita","amount":100,"additional_data":{"filial":"Fortaleza"}},{"date":"2026-08-02","description":"Taxa","category":"Taxas","type":"despesa","amount":10,"additional_data":{}}]'::jsonb,
    'confirmPossibleDuplicates', true, 'confirmManualOverwrite', true
  ),
  jsonb_build_object(
    'expectedImported', (select jsonb_agg(jsonb_build_object('id', id, 'version', version)) from public.transactions where origin = 'imported'),
    'updates', jsonb_build_array(jsonb_build_object(
      'id', (select id from public.transactions where description = 'Venda' and origin = 'imported'),
      'expectedVersion', (select version from public.transactions where description = 'Venda' and origin = 'imported'),
      'row', jsonb_build_object('date','2026-08-01','description','Venda','category','Vendas','type','receita','amount',100,'additional_data',jsonb_build_object('filial','Fortaleza'))
    )), 'deletes', '[]'::jsonb, 'inserts', '[]'::jsonb
  )
) from public.projects p join public.import_profiles ip on ip.project_id = p.id;
select is((select version from public.projects), 5::bigint, 'confirmed overwrite increments project once');
select isnt((select manually_modified from public.transactions where description = 'Venda' and origin = 'imported'), true, 'confirmed import clears manual edit marker');
select is((select manual_overwrite_count from public.import_runs where idempotency_key = 'a2000000-0000-0000-0000-000000000005'), 1, 'run records confirmed manual overwrite');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.apply_financial_import_update((select id from public.projects), 3, 'b2000000-0000-0000-0000-000000000001', '{"rows":[{}]}'::jsonb, '{"expectedImported":[],"updates":[],"deletes":[],"inserts":[]}'::jsonb)$$,
  'P0001', null, 'user B cannot import into user A project'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select public.apply_initial_financial_import('b2000000-0000-0000-0000-000000000002', '{}'::jsonb)$$,
  '42501', null, 'anonymous cannot execute import RPC'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.apply_initial_financial_import(
    'a2000000-0000-0000-0000-000000000099',
    jsonb_build_object(
      'project', jsonb_build_object('name', 'Rollback'),
      'file', jsonb_build_object('originalFilename', 'falha.csv', 'fileHash', repeat('f', 64)),
      'profile', jsonb_build_object('headers', '["Data"]'::jsonb, 'columns', '[]'::jsonb, 'mapping', '{"force":true}'::jsonb),
      'rows', '[{"date":"2026-08-01","description":"Falha","category":"Teste","type":"receita","amount":1}]'::jsonb,
      'confirmPossibleDuplicates', true
    )
  )$$,
  'P0001', null, 'forced failure rolls back the complete database transaction'
);
select is((select count(*) from public.projects where name = 'Rollback'), 0::bigint, 'rollback leaves no project');
select is((select count(*) from public.import_runs where idempotency_key = 'a2000000-0000-0000-0000-000000000099'), 0::bigint, 'rollback leaves no run');
select is((select count(*) from public.transactions where description = 'Falha'), 0::bigint, 'rollback leaves no transaction');
select is((select count(*) from public.import_profiles where mapping ? 'force'), 0::bigint, 'rollback leaves no profile');

select is((select count(*) from public.transactions where origin = 'manual'), 1::bigint, 'manual occurrence remains independent after all updates');
select is((select result->>'importRunId' from import_results where name = 'initial'), (select id::text from public.import_runs where operation = 'initial'), 'initial result identifies its committed run');

select * from finish();
rollback;
