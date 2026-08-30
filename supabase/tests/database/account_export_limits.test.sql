begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(7);

insert into auth.users (id, aud, role, email) values
  ('d1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'limit-projects@example.test'),
  ('d1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'limit-transactions@example.test'),
  ('d1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'limit-additional@example.test');

insert into public.projects (owner_user_id, name)
select 'd1000000-0000-4000-8000-000000000001', 'Projeto ' || value
from generate_series(1, 100) value;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);
select lives_ok($$select public.export_account_data_v1()$$, 'exactly 100 projects is allowed');

reset role;
insert into public.projects (owner_user_id, name)
values ('d1000000-0000-4000-8000-000000000001', 'Projeto 101');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);
select throws_ok($$select public.export_account_data_v1()$$, 'P0001', 'export_limit_exceeded', 'more than 100 projects is rejected');

reset role;
insert into public.projects (id, owner_user_id, name)
values ('d2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', 'Volume');
insert into public.transactions (
  project_id, owner_user_id, date, description, category, type, amount, origin
)
select
  'd2000000-0000-4000-8000-000000000002',
  'd1000000-0000-4000-8000-000000000002',
  '2026-08-30',
  'Transação ' || value,
  'Volume',
  'receita',
  1.00,
  'manual'
from generate_series(1, 25000) value;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000002', true);
select lives_ok($$select public.export_account_data_v1()$$, 'exactly 25000 transactions is allowed');

reset role;
insert into public.transactions (
  project_id, owner_user_id, date, description, category, type, amount, origin
) values (
  'd2000000-0000-4000-8000-000000000002',
  'd1000000-0000-4000-8000-000000000002',
  '2026-08-30',
  'Transação 25001',
  'Volume',
  'receita',
  1.00,
  'manual'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000002', true);
select throws_ok($$select public.export_account_data_v1()$$, 'P0001', 'export_limit_exceeded', 'more than 25000 transactions is rejected');

reset role;
insert into public.projects (id, owner_user_id, name)
values ('d2000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000003', 'Additional data');
insert into public.transactions (
  id, project_id, owner_user_id, date, description, category, type, amount, origin, additional_data
) values (
  'd3000000-0000-4000-8000-000000000003',
  'd2000000-0000-4000-8000-000000000003',
  'd1000000-0000-4000-8000-000000000003',
  '2026-08-30',
  'Limite JSON',
  'Volume',
  'receita',
  1.00,
  'manual',
  pg_catalog.jsonb_build_object('value', repeat('a', 262131))
);
select is(
  (select pg_catalog.octet_length(additional_data::text) from public.transactions where id = 'd3000000-0000-4000-8000-000000000003'),
  262144,
  'additional data fixture reaches exactly 256 KiB'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000003', true);
select lives_ok($$select public.export_account_data_v1()$$, 'exactly 256 KiB of additional data is allowed');

reset role;
update public.transactions
set additional_data = pg_catalog.jsonb_build_object('value', repeat('a', 262132))
where id = 'd3000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000003', true);
select throws_ok($$select public.export_account_data_v1()$$, 'P0001', 'export_limit_exceeded', 'more than 256 KiB of additional data is rejected');

select * from finish();
rollback;
