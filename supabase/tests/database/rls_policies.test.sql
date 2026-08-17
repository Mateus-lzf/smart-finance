begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(12);

insert into auth.users (id, aud, role, email)
values
  ('70000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'rls-a@example.test'),
  ('70000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'rls-b@example.test');

insert into public.projects (id, owner_user_id, name)
values
  ('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'Projeto A'),
  ('80000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002', 'Projeto B');

insert into public.transactions (project_id, owner_user_id, date, description, category, type, amount, origin)
values
  ('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '2026-08-01', 'A', 'Teste', 'receita', 100, 'manual'),
  ('80000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002', '2026-08-01', 'B', 'Teste', 'despesa', 50, 'manual');

set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);

select is((select count(*) from public.projects), 1::bigint, 'user A sees only one project');
select is((select name from public.projects), 'Projeto A', 'user A sees its own project');
select is((select count(*) from public.transactions), 1::bigint, 'user A sees only its transaction');

select lives_ok(
  $$insert into public.projects (owner_user_id, name) values ('70000000-0000-0000-0000-000000000001', 'Projeto A2')$$,
  'user A can create its own project'
);

select throws_ok(
  $$insert into public.projects (owner_user_id, name) values ('70000000-0000-0000-0000-000000000002', 'Invasão')$$,
  '42501', null, 'user A cannot create a project for user B'
);

select is_empty(
  $$update public.projects set name = 'Alterado' where id = '80000000-0000-0000-0000-000000000002' returning 1$$,
  'user A cannot update user B project'
);

select is_empty(
  $$delete from public.transactions where owner_user_id = '70000000-0000-0000-0000-000000000002' returning 1$$,
  'user A cannot delete user B transaction'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);

select is((select count(*) from public.projects), 1::bigint, 'user B sees only one project');
select is((select name from public.projects), 'Projeto B', 'user B sees its own project');
select is((select count(*) from public.transactions), 1::bigint, 'user B sees only its transaction');

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$select count(*) from public.projects$$,
  '42501', null, 'anonymous access cannot read projects'
);
select throws_ok(
  $$insert into public.projects (owner_user_id, name) values ('70000000-0000-0000-0000-000000000001', 'Anônimo')$$,
  '42501', null, 'anonymous access cannot insert projects'
);

select * from finish();
rollback;
