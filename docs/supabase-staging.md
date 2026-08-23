# Supabase staging runbook

This runbook records the staging environment delivered by Sprint 15 without making it a financial
data source. **Sprint 15 is CLOSED. Cloudflare Access is consciously deferred and documented;
Cloudflare Access is not complete.** Projects and transactions displayed by the product still come
exclusively from the per-user local AppStore/localStorage state.

## Sprint 15 closure status

The checkpoints below are complete. Evidence is deliberately classified by origin:

- **Code/static evidence:** environment guards, publishable-key-only clients, server-side session
  validation, RLS policies, local state isolation and Cloudflare runtime configuration.
- **Remote automated test:** `npm run test:staging` passed the symmetric A/B RLS matrix. Anonymous
  access and cross-user reads, updates, deletes and forged ownership were rejected. Both temporary
  fixtures were removed by their respective owners.
- **Manual staging validation:** signup with a new account, receipt and use of the first valid
  confirmation email, PKCE callback to `/dashboard`, authenticated session, refresh, logout,
  anonymous private-route protection, canonical post-login navigation and the complete password
  recovery/reset/login journey all passed.

No service-role, admin or database credential is part of the application runtime.

## Ownership and environment decisions

- The project must belong to the organization controlled by the Smart Finance owner.
- The sole administrator must enable MFA before creating or linking the project.
- Start on Supabase Free while staging is restricted to the owner.
- Select the region deliberately at project creation time.
- Use a sandbox SMTP provider before inviting external evaluators.
- The Cloudflare staging deployment uses its provider URL; no permanent domain is configured.
- Production will be a separate project and is not configured by this runbook.

## Files and credential classes

| File or binding             | Purpose                                               | Versioned |
| --------------------------- | ----------------------------------------------------- | --------- |
| `.env.local`                | local Docker URL and publishable key                  | no        |
| `.env.staging.local`        | staging URL, publishable key and expected project ref | no        |
| `.env.staging.test.local`   | disposable remote test users                          | no        |
| `.env.example`              | local placeholders                                    | yes       |
| `.env.staging.example`      | staging placeholders                                  | yes       |
| `.env.staging.test.example` | test placeholders                                     | yes       |

Only URL and `sb_publishable_` key may enter the browser bundle. Secret keys, `service_role`, admin
keys, database passwords, connection strings, personal access tokens, SMTP credentials, and JWT
signing material are forbidden in application env files and Git.

## Checkpoint boundaries

### 15A - local preparation — complete

- Validate all local suites.
- Validate the staging guard offline.
- Confirm `supabase/.temp/project-ref` is absent.
- Confirm no remote command or deployment occurred.

### 15B - remote schema — complete

- Create and configure the staging project manually.
- Link only after displaying and confirming its exact project ref.
- Dry-run and review migrations before application.
- Apply only committed migrations through `db:staging:push`.
- Validate schema, constraints, RLS and migration history.

### 15C - remote Auth/RLS — complete

- Configure exact Auth callback URLs.
- Use two disposable confirmed staging accounts.
- Run the opt-in remote test with the symmetric A/B matrix.
- Validate the application Server Function boundary and sanitized failure states.

The remote test passed and removed both technical fixtures. It remains opt-in and must never be run
against production.

### 15D - Cloudflare staging — complete

- Follow `docs/cloudflare-staging.md` as the deployment runbook.
- Create a distinct staging deployment and bindings.
- Allow only exact HTTPS callback URLs.
- Validate cookies, PKCE, refresh, recovery and logout in the deployed runtime.
- Confirm the financial localStorage value is unchanged before and after the journey.

The deployed runtime passed signup confirmation, PKCE callback, session refresh, logout, anonymous
route protection and password recovery/reset manual checks. The financial UI remained local and was
not connected or dual-written to PostgreSQL.

## Cloudflare Access decision

Cloudflare Access is **deferred**, not complete. Creating the Zero Trust Free organization required
a billing method, and the project owner consciously chose not to register a card during this stage.
No Access policy and no related Worker change were made.

This is not a functional failure of Smart Finance and does not reopen Sprint 15. It must be
reconsidered before commercial/production exposure or broader staging access. `X-Robots-Tag` and
`robots.txt` reduce accidental indexing but are not access control.

## Work after Sprint 15

The following commercial capabilities remain intentionally outside Sprint 15:

- remaining remote financial repositories and activation of remote persistence in the product UI;
- assisted migration of per-user and legacy local data;
- atomic remote CSV/XLSX import and update;
- separate production Supabase and Cloudflare environments;
- permanent domain and transactional SMTP;
- rate limiting, production observability and alerting;
- tested backup, recovery and operational rollback;
- account data export and deletion, privacy and LGPD procedures;
- production secret management and rotation;
- an appropriate staging/production edge-access strategy.

Do not treat the existing technical `projects` table or remote RLS smoke fixtures as the product's
financial source of truth.

## Sprint 16 repository boundary

Sprint 16A moved the current local persistence behind `FinancialRepository` without changing keys
or stored data. Sprint 16B prepares a narrower, authenticated `ProjectRepository` implementation,
Server Functions and optimistic concurrency behavior for future use. Sprint 16C adds a separate
`TransactionRepository` for versioned, unitary CRUD while leaving remote import/update operations
for an atomic checkpoint. Sprint 16D implements that checkpoint locally with transactional,
idempotent RPCs and a separate inactive `ImportRepository`. None of the Sprint 16B-16D
infrastructure is connected to the staging UI or deployed by these checkpoints. The staging
product continues to use only the per-user local workspace.

## Rollback rules

- Before push: stop; nothing remote changed.
- Failed dry-run: fix locally with a new migration if required; do not repair remote history blindly.
- Failed push: stop and inspect migration history; do not rerun or use `migration repair` without a
  specific recovery plan.
- Auth misconfiguration: disable staging signup if necessary and keep local development unchanged.
- RLS failure: treat staging as unavailable until anonymous and cross-user tests pass again.
- Never use `db reset --linked` as a routine rollback.
