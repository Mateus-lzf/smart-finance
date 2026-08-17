# Supabase local development

Sprint 14A adds a local PostgreSQL/Supabase foundation without changing the Smart Finance runtime.
The application continues to use `localStorage` as its only data source.

## Prerequisites

- Docker Desktop (or another Docker-compatible runtime) running.
- Dependencies installed from `bun.lock`.
- No Supabase account or remote project is required.

## Local workflow

Run commands from the repository root:

```sh
bun run db:start
bun run db:reset
bun run db:test
bun run db:lint
bun run db:types
bun run db:stop
```

The same scripts can be invoked with `npm run <script>` when Bun is not available on `PATH`.

`db:verify` resets the local database from migrations, runs pgTAP tests, and lints the schema:

```sh
bun run db:verify
```

`db:reset` is destructive only to the local Supabase database. No remote project is linked in
Sprint 14A.

## Source of truth

- `supabase/migrations/` is the only source of truth for database structure and policies.
- Do not make schema changes manually in Supabase Studio without creating a migration.
- `supabase/tests/database/` contains transactional pgTAP tests.
- `src/lib/supabase/database.types.ts` is generated from the local `public` schema and is a persistence
  contract, not a replacement for the existing domain types.
- Seed data is disabled. Tests create and roll back their own fixtures.

## Environment variables

Copy `.env.example` only when a later integration needs runtime clients. Sprint 14A does not read
these variables.

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are public by design.
- `SUPABASE_SECRET_KEY` is server-only, bypasses RLS, and must never use a `VITE_` prefix.
- Never commit `.env`, `.dev.vars`, credentials, access tokens, or generated local secrets.

For Cloudflare, future server secrets must be configured as secret bindings. They must not be
placed in client code or committed configuration.

## Security boundary

All public application tables have Row Level Security enabled. The `anon` role receives no table
privileges. Policies restrict authenticated rows to `auth.uid()`, and composite foreign keys make
cross-owner project relationships invalid even for privileged database writes.

No browser or server Supabase client is created in Sprint 14A. Authentication, repositories,
feature flags, remote persistence, and local-data migration belong to later sprints.

## Remote environments

There is deliberately no remote project linked in Sprint 14A. Do not run `supabase login`,
`supabase link`, `supabase db push`, or `supabase db reset --linked` as part of this sprint.
