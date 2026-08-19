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

## Environment separation

`npm run dev` remains the default local workflow and reads `.env.local`. It must keep pointing to
the Docker-hosted Supabase URL. Copy `.env.example` to `.env.local` and use the browser-safe values
reported by `supabase status`.

Remote staging is deliberately opt-in and uses a different Vite mode. Its ignored runtime file is
`.env.staging.local`, created from `.env.staging.example`. Do not put staging values in `.env.local`,
and never put production values in either file.

```sh
# local, offline-friendly development
npm run db:start
npm run dev

# future remote staging, only after Checkpoint 15B links the approved project
npm run dev:staging
```

The financial product UI still reads only AppStore and localStorage. Selecting the staging Auth
endpoint does not migrate, upload, namespace, or dual-write projects and transactions.

## Remote staging safety guard

Checkpoint 15A prepares remote commands but does not create or link a project. The only supported
remote database scripts are intentionally environment-specific:

```sh
npm run db:staging:check
npm run db:staging:plan
npm run db:staging:push -- --confirm-project-ref=<staging-project-ref>
```

There is intentionally no generic `db:push` script.

All three scripts refuse to proceed unless:

- `.env.staging.local` declares `SMART_FINANCE_REMOTE_ENVIRONMENT=staging`;
- the project ref has the expected hosted format;
- `VITE_SUPABASE_URL` exactly matches that project ref over HTTPS;
- the key is an `sb_publishable_` key;
- no privileged key/password variable is present;
- `supabase/.temp/project-ref` exists and exactly matches the declared staging ref;
- every file under `supabase/migrations/` is committed and unchanged.

`db:staging:check` performs only local validation. `db:staging:plan` runs
`supabase db push --dry-run`. `db:staging:push` first repeats the dry-run, then requires both the
exact `--confirm-project-ref` argument and this process-only environment confirmation:

```text
SMART_FINANCE_STAGING_APPLY=APPLY_TO_STAGING_<staging-project-ref>
```

The link is checked again between dry-run and application. Never add that confirmation to an env
file. Never run `supabase db reset --linked`; it is destructive to the linked remote database.

Run the guard's offline unit checks with:

```sh
npm run test:staging:guard
```

## Opt-in remote smoke test

`npm run test:staging` is prepared for Checkpoint 15C but must not be run during 15A. It requires:

- a validated staging link and configuration;
- `.env.staging.test.local` copied from `.env.staging.test.example`;
- the explicit remote-test confirmation value;
- two distinct, confirmed, disposable staging-only users.

It authenticates both users with the publishable key, proves anonymous rejection and cross-user RLS,
creates one clearly named technical project, and removes that fixture in `finally`. It neither
imports nor reads local financial data. This network-dependent test is intentionally excluded from
`npm test` and `db:verify`.

## Remote operations lifecycle

Checkpoint 15A must end with no remote link. In 15B, after separate approval, the operator will:

1. create the dedicated staging project manually in the controlled Supabase organization;
2. copy only its ref, URL, and publishable key into ignored local files;
3. run `supabase login` and `supabase link --project-ref <exact-ref>` explicitly;
4. run `db:staging:check` and inspect the printed ref and URL;
5. run `db:staging:plan` and review every pending migration;
6. obtain approval before running the doubly confirmed staging push;
7. remove the local link after the checkpoint when it is no longer needed.

Production will use another Supabase project, another application deployment, and another approval
workflow. Staging files and scripts must never be repurposed for production.
