create extension if not exists pgcrypto with schema extensions;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;

create table public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  locale text not null default 'pt-BR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_display_name_length check (
    display_name is null or char_length(display_name) between 1 and 160
  ),
  constraint user_profiles_locale_not_blank check (char_length(btrim(locale)) between 2 and 35)
);

create table public.projects (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  type text,
  description text,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_name_length check (char_length(btrim(name)) between 1 and 160),
  constraint projects_type_length check (type is null or char_length(btrim(type)) between 1 and 120),
  constraint projects_description_length check (
    description is null or char_length(btrim(description)) between 1 and 2000
  ),
  constraint projects_version_positive check (version >= 1),
  constraint projects_id_owner_unique unique (id, owner_user_id)
);

create table public.import_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null,
  owner_user_id uuid not null,
  operation text not null,
  status text not null default 'pending',
  original_filename text,
  file_hash text,
  row_count integer not null default 0,
  added_count integer not null default 0,
  changed_count integer not null default 0,
  removed_count integer not null default 0,
  duplicate_count integer not null default 0,
  base_project_version bigint,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint import_runs_project_owner_fk
    foreign key (project_id, owner_user_id)
    references public.projects (id, owner_user_id)
    on delete cascade,
  constraint import_runs_operation_valid check (operation in ('initial', 'update')),
  constraint import_runs_status_valid check (
    status in ('pending', 'processing', 'completed', 'failed')
  ),
  constraint import_runs_filename_length check (
    original_filename is null or char_length(original_filename) between 1 and 255
  ),
  constraint import_runs_file_hash_length check (
    file_hash is null or char_length(file_hash) between 1 and 256
  ),
  constraint import_runs_counts_non_negative check (
    row_count >= 0
    and added_count >= 0
    and changed_count >= 0
    and removed_count >= 0
    and duplicate_count >= 0
  ),
  constraint import_runs_base_version_positive check (
    base_project_version is null or base_project_version >= 1
  ),
  constraint import_runs_error_code_length check (
    error_code is null or char_length(error_code) between 1 and 120
  ),
  constraint import_runs_id_project_owner_unique unique (id, project_id, owner_user_id)
);

create table public.transactions (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null,
  owner_user_id uuid not null,
  date date not null,
  description text not null,
  category text not null,
  type text not null,
  amount numeric(18, 2) not null,
  origin text not null,
  manually_modified boolean not null default false,
  additional_data jsonb not null default '{}'::jsonb,
  import_run_id uuid,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_project_owner_fk
    foreign key (project_id, owner_user_id)
    references public.projects (id, owner_user_id)
    on delete cascade,
  constraint transactions_import_run_project_owner_fk
    foreign key (import_run_id, project_id, owner_user_id)
    references public.import_runs (id, project_id, owner_user_id)
    on delete set null (import_run_id),
  constraint transactions_description_length check (
    char_length(btrim(description)) between 1 and 500
  ),
  constraint transactions_category_length check (char_length(btrim(category)) between 1 and 160),
  constraint transactions_type_valid check (type in ('receita', 'despesa')),
  constraint transactions_amount_positive check (amount > 0),
  constraint transactions_origin_valid check (origin in ('manual', 'imported')),
  constraint transactions_additional_data_object check (jsonb_typeof(additional_data) = 'object'),
  constraint transactions_version_positive check (version >= 1)
);

create table public.import_profiles (
  project_id uuid primary key,
  owner_user_id uuid not null,
  headers jsonb not null,
  columns jsonb not null,
  mapping jsonb not null,
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_profiles_project_owner_fk
    foreign key (project_id, owner_user_id)
    references public.projects (id, owner_user_id)
    on delete cascade,
  constraint import_profiles_headers_array check (jsonb_typeof(headers) = 'array'),
  constraint import_profiles_columns_array check (jsonb_typeof(columns) = 'array'),
  constraint import_profiles_mapping_object check (jsonb_typeof(mapping) = 'object'),
  constraint import_profiles_schema_version_positive check (schema_version >= 1)
);

create table public.project_preferences (
  project_id uuid not null,
  user_id uuid not null,
  visible_columns jsonb not null default '[]'::jsonb,
  analytical_dimensions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, user_id),
  constraint project_preferences_project_user_fk
    foreign key (project_id, user_id)
    references public.projects (id, owner_user_id)
    on delete cascade,
  constraint project_preferences_visible_columns_array check (
    jsonb_typeof(visible_columns) = 'array'
  ),
  constraint project_preferences_analytical_dimensions_array check (
    jsonb_typeof(analytical_dimensions) = 'array'
  ),
  constraint project_preferences_dimension_limit check (
    jsonb_array_length(analytical_dimensions) <= 3
  )
);

create index projects_owner_updated_idx
  on public.projects (owner_user_id, updated_at desc);

create index transactions_project_date_idx
  on public.transactions (project_id, date desc, id);

create index transactions_project_type_date_idx
  on public.transactions (project_id, type, date desc, id);

create index transactions_project_category_date_idx
  on public.transactions (project_id, category, date desc, id);

create index transactions_owner_project_idx
  on public.transactions (owner_user_id, project_id);

create index transactions_import_run_idx
  on public.transactions (import_run_id)
  where import_run_id is not null;

create index import_runs_project_created_idx
  on public.import_runs (project_id, created_at desc);

create index import_runs_owner_created_idx
  on public.import_runs (owner_user_id, created_at desc);

create trigger user_profiles_set_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

create trigger transactions_set_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

create trigger import_profiles_set_updated_at
before update on public.import_profiles
for each row execute function public.set_updated_at();

create trigger project_preferences_set_updated_at
before update on public.project_preferences
for each row execute function public.set_updated_at();

comment on column public.transactions.date is
  'Calendar-only financial date. No timezone conversion applies.';

comment on column public.transactions.additional_data is
  'Flexible imported fields; normalized financial fields remain in dedicated columns.';
