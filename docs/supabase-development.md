# Supabase local development

Sprint 14A adds a local PostgreSQL/Supabase foundation. Sprint 14B1 adds a local authentication and
server-session boundary without changing the financial data source. The application continues to
use `localStorage` as its only source for projects and transactions.

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
bun run test:auth
bun run db:stop
```

The same scripts can be invoked with `npm run <script>` when Bun is not available on `PATH`.

`db:verify` resets the local database from migrations, runs pgTAP tests, lints the schema, and
executes the local Auth/Server Function/RLS integration test:

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

The 14B1 runtime clients read the browser-safe URL and publishable key shown by `supabase status`.
For manual local development, copy `.env.example` to `.env.local` and replace only its placeholders
with the local values. `.env.local` is ignored by Git.

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are public by design.
- Sprint 14B1 has no service-role, secret-key, or admin-key runtime variable.
- Never commit `.env`, `.dev.vars`, credentials, access tokens, or generated local secrets.

For Cloudflare, future server secrets must be configured as secret bindings. They must not be
placed in client code or committed configuration.

## Local Auth and Mailpit

Start Supabase and the application, then open the Mailpit URL reported by `supabase status` to inspect
local confirmation messages. Auth is configured with email confirmation, a minimum password length
of eight characters, refresh-token rotation, and exact local callback URLs. No real email or remote
Supabase project is used.

`test:auth` starts a temporary Vite development server and proves the complete local chain with two
distinct users:

```text
cookie session -> TanStack Server Function -> Supabase client -> PostgreSQL RLS
```

The test covers signup, local email confirmation through Mailpit, valid and invalid login, session
validation, refresh, logout, anonymous/invalid-session rejection, and cross-user project isolation.
The technical project Server Functions are not imported by any route or product UI.

## Security boundary

All public application tables have Row Level Security enabled. The `anon` role receives no table
privileges. Policies restrict authenticated rows to `auth.uid()`, and composite foreign keys make
cross-owner project relationships invalid even for privileged database writes.

The server client is created per request with the publishable key and the authenticated user's
cookies. It does not bypass RLS. `owner_user_id` is derived from the validated server session and is
not accepted as authority from client input.

The browser client exists as the SSR-compatible session client but is not connected to the current
product UI in 14B1. Route protection and authentication screens belong to 14B2. Repositories, remote
financial persistence, feature flags, and local-data migration remain future work.

Existing financial data is not uploaded, associated with an account, copied, renamed, or removed.
Authentication and financial application state intentionally remain separate.

## Remote environments

There is deliberately no remote project linked in Sprint 14A. Do not run `supabase login`,
`supabase link`, `supabase db push`, or `supabase db reset --linked` as part of this sprint.
