begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(8);

insert into auth.users (id, aud, role, email)
values ('30000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'cascade@example.test');

insert into public.projects (id, owner_user_id, name)
values ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Cascade');

insert into public.import_runs (id, project_id, owner_user_id, operation, status)
values (
  '50000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'initial',
  'completed'
);

insert into public.transactions (
  id, project_id, owner_user_id, date, description, category, type, amount, origin, import_run_id
) values (
  '60000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '2026-08-01', 'Venda', 'Vendas', 'receita', 100, 'imported',
  '50000000-0000-0000-0000-000000000001'
);

delete from public.import_runs where id = '50000000-0000-0000-0000-000000000001';

select is(
  (select count(*) from public.transactions where id = '60000000-0000-0000-0000-000000000001'),
  1::bigint,
  'deleting import metadata does not delete a transaction'
);

select is(
  (select import_run_id from public.transactions where id = '60000000-0000-0000-0000-000000000001'),
  null::uuid,
  'deleted import metadata clears only import_run_id'
);

insert into public.import_profiles (project_id, owner_user_id, headers, columns, mapping)
values (
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '[]', '[]', '{}'
);

insert into public.project_preferences (project_id, user_id)
values (
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001'
);

insert into public.import_runs (project_id, owner_user_id, operation)
values (
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'update'
);

delete from public.projects where id = '40000000-0000-0000-0000-000000000001';

select is((select count(*) from public.transactions), 0::bigint, 'project deletion cascades transactions');
select is((select count(*) from public.import_profiles), 0::bigint, 'project deletion cascades profile');
select is((select count(*) from public.project_preferences), 0::bigint, 'project deletion cascades preferences');
select is((select count(*) from public.import_runs), 0::bigint, 'project deletion cascades import runs');

delete from auth.users where id = '30000000-0000-0000-0000-000000000001';
select is((select count(*) from public.projects), 0::bigint, 'user deletion leaves no projects');
select is((select count(*) from public.user_profiles), 0::bigint, 'user deletion leaves no profile');

select * from finish();
rollback;
