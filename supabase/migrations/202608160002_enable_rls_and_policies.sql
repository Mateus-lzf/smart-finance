alter table public.user_profiles enable row level security;
alter table public.projects enable row level security;
alter table public.transactions enable row level security;
alter table public.import_profiles enable row level security;
alter table public.project_preferences enable row level security;
alter table public.import_runs enable row level security;

revoke all on table public.user_profiles from anon, authenticated;
revoke all on table public.projects from anon, authenticated;
revoke all on table public.transactions from anon, authenticated;
revoke all on table public.import_profiles from anon, authenticated;
revoke all on table public.project_preferences from anon, authenticated;
revoke all on table public.import_runs from anon, authenticated;

grant select, insert, update, delete on table public.user_profiles to authenticated;
grant select, insert, update, delete on table public.projects to authenticated;
grant select, insert, update, delete on table public.transactions to authenticated;
grant select, insert, update, delete on table public.import_profiles to authenticated;
grant select, insert, update, delete on table public.project_preferences to authenticated;
grant select, insert, update, delete on table public.import_runs to authenticated;

create policy user_profiles_owner_access
on public.user_profiles
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy projects_owner_access
on public.projects
for all
to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy transactions_owner_access
on public.transactions
for all
to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy import_profiles_owner_access
on public.import_profiles
for all
to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy project_preferences_owner_access
on public.project_preferences
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy import_runs_owner_access
on public.import_runs
for all
to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);
