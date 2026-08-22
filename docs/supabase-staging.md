# Supabase staging runbook

This runbook prepares the Smart Finance staging environment without making it a financial data
source. Checkpoint 15A contains no remote project, login, link, push, or deployment.

## Ownership and environment decisions

- The project must belong to the organization controlled by the Smart Finance owner.
- The sole administrator must enable MFA before creating or linking the project.
- Start on Supabase Free while staging is restricted to the owner.
- Select the region deliberately at project creation time.
- Use a sandbox SMTP provider before inviting external evaluators.
- The future Cloudflare staging deployment will initially use its provider URL.
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

### 15A — local preparation

- Validate all local suites.
- Validate the staging guard offline.
- Confirm `supabase/.temp/project-ref` is absent.
- Confirm no remote command or deployment occurred.

### 15B — remote schema, separately approved

- Create and configure the staging project manually.
- Link only after displaying and confirming its exact project ref.
- Dry-run and review migrations before application.
- Apply only committed migrations through `db:staging:push`.
- Validate schema, constraints, RLS and migration history.

### 15C — remote Auth/RLS, separately approved

- Configure exact Auth callback URLs.
- Use two disposable confirmed staging accounts.
- Run the opt-in remote test.
- Validate the application Server Function boundary and sanitized failure states.

### 15D - Cloudflare staging, separately approved

- Follow `docs/cloudflare-staging.md` as the deployment runbook.
- Create a distinct staging deployment and bindings.
- Allow only exact HTTPS callback URLs.
- Validate cookies, PKCE, refresh, recovery and logout in the deployed runtime.
- Confirm the financial localStorage value is unchanged before and after the journey.

## Rollback rules

- Before push: stop; nothing remote changed.
- Failed dry-run: fix locally with a new migration if required; do not repair remote history blindly.
- Failed push: stop and inspect migration history; do not rerun or use `migration repair` without a
  specific recovery plan.
- Auth misconfiguration: disable staging signup if necessary and keep local development unchanged.
- RLS failure: treat staging as unavailable until anonymous and cross-user tests pass again.
- Never use `db reset --linked` as a routine rollback.
