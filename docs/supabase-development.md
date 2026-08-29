# Supabase local development

Sprint 14A adds a local PostgreSQL/Supabase foundation. Sprint 14B adds authentication and the
server-session boundary. Sprint 16A introduces the financial persistence contract with the local
adapter, and Sprint 16B prepares authenticated remote Project operations behind a separate,
inactive repository. Sprint 16C adds an equally inactive, versioned Transaction repository for
unitary CRUD. Sprint 16D adds an inactive `ImportRepository` and transactional PostgreSQL RPCs for
idempotent initial imports and updates. Sprint 16E composes those boundaries into a complete
`RemoteFinancialRepository` and closes the controlled staging pilot. Each authenticated session
uses exactly one financial source: `LocalFinancialRepository` by default or
`RemoteFinancialRepository` only when selected by the server-side pilot allowlist.

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
bun run test:projects
bun run test:transactions
bun run test:remote-import
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
validation, refresh, logout, anonymous/invalid-session rejection, and symmetric cross-user Project
isolation. It also exercises versioned create, read, update and delete through the same Project
Server Functions prepared for future repositories. Those functions and `RemoteProjectRepository`
are not imported by any route or by the financial product UI.

`test:projects` is an offline contract/mapping test. It validates the domain/database mapper,
repository error semantics and static security boundaries without contacting Supabase.

`test:transactions` performs the equivalent offline validation for Transactions, including
date-only values, safe monetary cents, scalar `additionalData`, immutable provenance and the
absence of remote imports in the financial UI. The Auth integration additionally proves unitary
Transaction CRUD, optimistic concurrency, legitimate identical occurrences and symmetric A/B
isolation against local PostgreSQL/RLS.

`test:remote-import` validates the inactive remote import contract, normalized payload, date-only,
monetary and profile rules, limits and static UI separation. The Auth integration proves the
session-to-Server-Function-to-RPC path with two users. `atomic_import.test.sql` proves full
rollback, idempotent replay, stale snapshot rejection, manual preservation and one logical Project
version increment per committed import.

## Security boundary

All public application tables have Row Level Security enabled. The `anon` role receives no table
privileges. Policies restrict authenticated rows to `auth.uid()`, and composite foreign keys make
cross-owner project relationships invalid even for privileged database writes.

The server client is created per request with the publishable key and the authenticated user's
cookies. It does not bypass RLS. `owner_user_id` is derived from the validated server session and is
not accepted as authority from client input.

The browser client is the SSR-compatible user-session client. Sprint 14B2 completed the Auth UI,
server-aware route protection, PKCE callbacks, password recovery and logout. It remains separate
from the financial AppStore. Remote financial persistence is available only to the controlled
pilot. The former assisted local-data migration Sprint 16F was retired because there are no
commercial legacy users; the commercial roadmap now starts with remote-by-default in Sprint 17.

Existing local financial data is not uploaded, associated with an account, copied, renamed, or
removed automatically. Authentication and financial application state intentionally remain
separate.

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

# opt-in development against the existing staging project
npm run dev:staging
```

The financial product UI still reads only the AppStore facade, which receives one repository for
the authenticated session. Selecting the staging Auth endpoint alone does not migrate or upload
projects and transactions. Accounts outside the allowlist remain local; an allowlisted pilot uses
only the remote repository. There is no dual-write.

## Financial mode pilot configuration

Sprint 16E-C introduced one financial source per authenticated session. The server resolves
`local | remote` from `SMART_FINANCE_REMOTE_PILOT_USER_IDS`, a server-only comma-separated list of
Supabase Auth user UUIDs. Missing, empty, malformed, duplicated or oversized configuration fails
closed to `local`. The browser cannot choose or override the mode, and the variable must never use
the `VITE_` prefix.

For local verification, use only disposable users from the local Supabase instance in the ignored
`.env.local` file. No identity is versioned. A remote session never reads or writes financial
localStorage and never falls back to it after a network or authorization error. A local session
continues to use the existing per-user local repository and performs no remote financial write.

Versioned examples keep the allowlist empty and never contain a pilot identity. Sprint 16E-D
promoted the reviewed migrations, validated the remote financial matrix, deployed with the pilot
disabled and then enabled exactly one disposable account through the server-only staging binding.
The pilot remains allowlist-controlled.

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

`npm run test:staging` is the opt-in remote RLS verification delivered in Sprint 15. It requires:

- a validated staging link and configuration;
- `.env.staging.test.local` copied from `.env.staging.test.example`;
- the explicit remote-test confirmation value;
- two distinct, confirmed, disposable staging-only users.

It authenticates both users with the publishable key, proves anonymous rejection, and creates one
temporary project per owner. In both A-to-B and B-to-A directions it proves that cross-user select,
update and delete affect zero rows and that forged `owner_user_id` values are rejected. Each owner
then removes exactly its own fixture in `finally`, and both sign-outs are attempted even if cleanup
fails. It neither imports nor reads local financial data. This network-dependent test is
intentionally excluded from `npm test` and `db:verify`.

The symmetric remote matrix passed during Sprint 15 closure and removed both technical fixtures.
That historical result does not remove the explicit opt-in requirement for future executions.

## Remote operations lifecycle

Sprint 15 created and linked the dedicated staging project through the guarded 15B workflow. For a
new staging project or a future migration change, the operator must still:

1. create the dedicated staging project manually in the controlled Supabase organization;
2. copy only its ref, URL, and publishable key into ignored local files;
3. run `supabase login` and `supabase link --project-ref <exact-ref>` explicitly;
4. run `db:staging:check` and inspect the printed ref and URL;
5. run `db:staging:plan` and review every pending migration;
6. obtain approval before running the doubly confirmed staging push;
7. remove the local link after the checkpoint when it is no longer needed.

Production will use another Supabase project, another application deployment and another approval
workflow. Staging files and scripts must never be repurposed for production.

## Sprint 15 closure and next boundary

Sprint 15 is **CLOSED**. Cloudflare Access is consciously deferred and documented; Cloudflare Access
is not complete.
Manual staging validation covered signup confirmation, PKCE redirect to `/dashboard`, authenticated
session and refresh, logout, anonymous private-route rejection, canonical empty Dashboard and the
complete password recovery/reset/login journey. The remote symmetric RLS test passed separately.

Cloudflare Access was not configured because the Zero Trust Free onboarding required a billing
method and no card was registered. This is not an application failure, but Access or an equivalent
protection must be reconsidered before commercial/production exposure or broader staging access.

The Project, Transaction and Import infrastructure prepared in Sprints 16B-16D is composed by the
remote repository delivered in Sprint 16E. Transaction CRUD remains unitary; bulk imports use only
the atomic RPCs and never a CRUD loop. The controlled pilot proved remote Projects, Transactions,
preferences, CSV/XLSX imports and reimports without dual-write or automatic remote-to-local
fallback. The former Sprint 16F was retired because no commercial legacy users require migration;
`docs/commercial-roadmap.md` supersedes it. Production separation, domain,
SMTP, rate limiting, observability, backup/recovery, account export/deletion, LGPD operations,
secret rotation and rollback remain additional commercial work. None of these capabilities was
implemented by Sprint 15.

## Sprint 16E closure

Sprint 16E-D6 and Sprint 16E are **CLOSED with PASS**. Evidence is deliberately separated by
origin:

- **Automated evidence:** local repository, remote repository, financial-mode, Auth/RLS and remote
  staging matrices cover ownership, A/B isolation, optimistic concurrency, atomic imports,
  idempotency, preference versions, absence of CRUD import loops and absence of automatic fallback.
- **Manual staging evidence:** the allowlisted account created and managed Projects and
  Transactions through the UI; CSV and XLSX import and reimport covered added, changed and removed
  rows, legitimate duplicates, manual rows and manually edited imported rows. Dashboard, Data,
  Insights and Reports used the same remote source. Refresh, another browser and a mobile device
  showed the same financial data. Search, filters, visible columns, deletion/cancellation, report
  CSV and printing also passed. Offline use did not expose a local workspace, and reconnecting
  restored the remote workspace.
- **Persistence evidence:** the remote session did not write a financial workspace to
  `localStorage`; no dual-write occurred. Column visibility persisted remotely and was observed on
  another device.

During acceptance, refresh initially selected the first remote Project instead of the current one.
Commit `5a03169` stores `activeProjectId` as a per-user, per-device interface preference and restores
it only after a valid remote snapshot. Manual retest passed. This preference may intentionally
differ between devices and is not a financial workspace or a remote synchronization field.

No known functional blocker remains for Sprint 16E. No commercial legacy users exist, so the former
assisted local-to-remote Sprint 16F was retired rather than implemented speculatively. The roadmap
continues in `docs/commercial-roadmap.md`; Sprint 17 is the next implementation checkpoint and will
make remote persistence the safe commercial default while preserving local mode only for an
explicit development/test purpose.
