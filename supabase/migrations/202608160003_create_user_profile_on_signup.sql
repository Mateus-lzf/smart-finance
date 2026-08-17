create function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text;
begin
  profile_name := nullif(btrim(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 160)), '');

  insert into public.user_profiles (user_id, display_name)
  values (new.id, profile_name)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user_profile() from public;

create trigger auth_user_created_create_profile
after insert on auth.users
for each row execute function public.handle_new_user_profile();

insert into public.user_profiles (user_id)
select id
from auth.users
on conflict (user_id) do nothing;
