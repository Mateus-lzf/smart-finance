begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(8);

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values
  (
    '71000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'profile-a@example.test',
    '{"display_name":"  Maria  "}'::jsonb
  ),
  (
    '71000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'profile-b@example.test',
    '{}'::jsonb
  );

select is(
  (select display_name from public.user_profiles where user_id = '71000000-0000-0000-0000-000000000001'),
  'Maria',
  'signup trigger creates a profile with a normalized display name'
);
select is(
  (select locale from public.user_profiles where user_id = '71000000-0000-0000-0000-000000000001'),
  'pt-BR',
  'signup trigger applies the default locale'
);
select is(
  (select display_name from public.user_profiles where user_id = '71000000-0000-0000-0000-000000000002'),
  null,
  'missing display name remains null'
);

select has_function(
  'public',
  'handle_new_user_profile',
  array[]::text[],
  'profile trigger function is present'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);

select is((select count(*) from public.user_profiles), 1::bigint, 'user A sees only its profile');
select is(
  (select display_name from public.user_profiles),
  'Maria',
  'user A reads its own profile'
);
select is_empty(
  $$update public.user_profiles set display_name = 'Invasao' where user_id = '71000000-0000-0000-0000-000000000002' returning 1$$,
  'user A cannot update user B profile'
);

reset role;
delete from auth.users where id = '71000000-0000-0000-0000-000000000001';
select is(
  (select count(*) from public.user_profiles where user_id = '71000000-0000-0000-0000-000000000001'),
  0::bigint,
  'deleting an auth user cascades to its profile'
);

select * from finish();
rollback;
