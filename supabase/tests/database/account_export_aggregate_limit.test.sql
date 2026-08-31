begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(10);

insert into auth.users (id, aud, role, email) values
  ('e1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'aggregate-a@example.test'),
  ('e1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'aggregate-b@example.test');

insert into public.projects (id, owner_user_id, name) values
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'Aggregate A'),
  ('e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000002', 'Aggregate B');

insert into public.import_profiles (
  project_id, owner_user_id, headers, columns, mapping
) values
  (
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    '[]',
    '[]',
    '{"payload":""}'
  ),
  (
    'e2000000-0000-4000-8000-000000000002',
    'e1000000-0000-4000-8000-000000000002',
    '["B-only"]',
    '[]',
    '{}'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.export_account_data_v1()$$,
  'aggregate payload clearly below the conservative boundary is allowed'
);

create temporary table aggregate_export_measurement (base_size integer, filler_size integer);
insert into aggregate_export_measurement (base_size, filler_size)
select measured_size, 20971520 - measured_size
from (
  select (
    65536
    + (
      select sum(
        (2 * pg_catalog.octet_length(project.id::text) + 3)
        + (2 * pg_catalog.octet_length(project.owner_user_id::text) + 3)
        + (2 * pg_catalog.octet_length(project.name) + 3)
        + (2 * pg_catalog.octet_length(coalesce(project.type, '')) + 3)
        + (2 * pg_catalog.octet_length(coalesce(project.description, '')) + 3)
        + (2 * pg_catalog.octet_length(project.version::text) + 3)
        + (2 * pg_catalog.octet_length(project.created_at::text) + 3)
        + (2 * pg_catalog.octet_length(project.updated_at::text) + 3)
        + 9
      )
      from public.projects project
      where project.owner_user_id = 'e1000000-0000-4000-8000-000000000001'
    )
    + (
      select pg_catalog.octet_length(pg_catalog.jsonb_pretty(
        pg_catalog.jsonb_agg(to_jsonb(profile) order by profile.project_id)
      ))
      from public.import_profiles profile
      where profile.owner_user_id = 'e1000000-0000-4000-8000-000000000001'
    )
    + pg_catalog.octet_length(pg_catalog.jsonb_pretty('[]'::jsonb))
    + (
      select pg_catalog.octet_length(pg_catalog.jsonb_pretty(to_jsonb(profile)))
      from public.user_profiles profile
      where profile.user_id = 'e1000000-0000-4000-8000-000000000001'
    )
  )::integer measured_size
) measurement;

reset role;
update public.import_profiles
set mapping = pg_catalog.jsonb_build_object(
  'payload',
  repeat('x', (select filler_size from aggregate_export_measurement))
)
where project_id = 'e2000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
select is(
  (select base_size + filler_size from aggregate_export_measurement),
  20971520,
  'the conservative upper bound can reach exactly 20 MiB'
);
select lives_ok(
  $$select public.export_account_data_v1()$$,
  'exactly 20 MiB in the conservative upper bound is allowed'
);

reset role;
update public.import_profiles
set mapping = pg_catalog.jsonb_build_object(
  'payload',
  repeat('x', (select filler_size + 1 from aggregate_export_measurement))
)
where project_id = 'e2000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.export_account_data_v1()$$,
  'P0001',
  'export_limit_exceeded',
  'the first byte above the conservative boundary is rejected before returning a snapshot'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.export_account_data_v1()$$,
  'A oversized payload does not prevent B from exporting own data'
);
select is(
  public.export_account_data_v1()#>>'{projects,0,name}',
  'Aggregate B',
  'B receives only the own project'
);
select is(
  public.export_account_data_v1()#>>'{import_profiles,0,headers,0}',
  'B-only',
  'B receives only the own import profile'
);

reset role;
select ok(
  has_function_privilege('authenticated', 'public.export_account_data_v1()', 'execute'),
  'authenticated retains execute privilege'
);
select ok(
  not has_function_privilege('anon', 'public.export_account_data_v1()', 'execute'),
  'anon remains unable to execute the export RPC'
);

set local role anon;
select throws_ok(
  $$select public.export_account_data_v1()$$,
  '42501',
  null,
  'anonymous execution remains rejected'
);

select * from finish();
rollback;
