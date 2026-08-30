# Cloudflare Workers staging runbook

The Smart Finance staging application uses Cloudflare Workers with Static Assets. Checkpoint 15D-A
prepared the repository and Checkpoint 15D-B deployed and validated the staging Worker. **Sprint 15
is CLOSED. Cloudflare Access is consciously deferred and documented; Cloudflare Access is not
complete.** This runbook remains the source of truth for safe staging builds and future redeploys.

## Runtime contract

- Nitro compiles `src/server.ts` to `.output/server/index.mjs`.
- Static assets are emitted to `.output/public`.
- `wrangler.jsonc` is the versioned deployment source of truth.
- Only the named `staging` environment enables `workers.dev`.
- The Worker is always named `smart-finance-staging`.
- Versioned preview URLs are disabled.
- No production environment exists in this checkpoint.

The runtime receives `SMART_FINANCE_ENVIRONMENT=staging` plus the two public Supabase settings:
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Browser code reads these browser-safe values
from `import.meta.env`, while Server Functions read the Worker bindings from `process.env` inside each
request. The staging guard requires the runtime bindings to match `.env.staging.local` exactly.

These public settings identify the Supabase project and authorize only the public client role; RLS
remains the data-access boundary. The Worker has no database password, connection string, service
role, secret key, or admin key. A future production environment must define its own independent vars.

## Local preparation and dry-run

```sh
npm run build:staging
npm run test:cloudflare:staging
npm run cloudflare:staging:plan
```

`cloudflare:staging:plan` validates the committed Wrangler contract, Supabase staging URL/ref/link,
the exact equality of the Vite and Worker public Supabase settings, Nitro artifacts, and then runs
Wrangler with `deploy --dry-run`. It writes only local output under `.wrangler/staging-dry-run` and
neither authenticates nor uploads anything.

## Remote identity check

The ignored `.env.cloudflare.staging.local` provides the approved account ID. Before a future
redeploy, the operator may run:

```sh
npm run cloudflare:staging:check
```

That command calls `wrangler whoami` and refuses an authenticated account that does not contain the
exact approved account ID. The env file rejects tokens, API keys, secrets, passwords, database URLs,
and service-role variables.

## Redeploy guard

There is deliberately no generic deploy script. A staging deploy requires:

- a completely clean Git working tree;
- an exact Supabase staging link;
- a valid staging build;
- the approved Cloudflare account;
- the exact `--confirm-worker=smart-finance-staging` argument;
- the process-only value `SMART_FINANCE_CLOUDFLARE_DEPLOY=DEPLOY_SMART_FINANCE_STAGING`;
- a successful local Wrangler dry-run;
- a second account check immediately before upload.

Never store the one-time deployment confirmation in an env file. Wrangler login and deploy require
separate explicit approval. A successful previous deployment never authorizes another upload.

## Validated staging behavior

The following evidence closed the application-runtime portion of Checkpoint 15D-B:

- **Code/static evidence:** Nitro Worker and assets configuration, per-request Supabase environment,
  publishable-key-only clients, server-aware private routes, log redaction and anti-indexing headers.
- **Remote automated test:** the symmetric A/B Auth/RLS matrix rejected anonymous access,
  cross-user reads, updates, deletes and forged ownership, then removed both owner fixtures.
- **Manual staging validation:** signup with the first valid confirmation link, PKCE redirect to
  `/dashboard`, authenticated session, refresh, logout, anonymous-route rejection, canonical
  post-login navigation and password recovery/reset/login passed over HTTPS.

Sprint 16E subsequently enabled one disposable remote financial pilot. Sprint 17 then promoted
staging to remote-by-default through `SMART_FINANCE_ENVIRONMENT=staging` and removed the legacy
allowlist secret. Every authenticated staging session uses `RemoteFinancialRepository`; invalid or
missing environment configuration is unavailable rather than local. The Worker does not migrate or
dual-write local data, and a remote failure never falls back to a local workspace.

## Security before first deploy

- Staging responses receive `X-Robots-Tag: noindex, nofollow, noarchive`.
- `/robots.txt` disallows every crawler only when the Worker runtime environment is staging.
- Error logging redacts authorization values, cookies, auth/reset codes, JWTs and email addresses.
- Cloudflare Access was consciously deferred because creating the Zero Trust Free organization
  required a billing method and no card was registered at this stage.
- No Access policy and no related Worker change were made. Access or an equivalent edge protection
  must be reconsidered before commercial/production exposure or wider staging access.
- Crawler directives are defense in depth only and must never be described as access control.
- Logs must never include request bodies, passwords, cookies, full callback URLs, or financial data.

## Rollback boundary after deployment

If build, size, startup, compatibility or secret auditing fails, stop before redeploying. Do not
alter Supabase, disable RLS or add privileged credentials to work around a Worker failure. A remote
rollback must use an explicitly reviewed previously working application revision or disable access
to the staging Worker through an approved Cloudflare operation; the exact deployment/version ID is
external state and is not recorded in Git. Production requires its own documented rollback process.

## Commercial gaps after Sprint 15

This staging deployment is not a production launch. The controlled remote pilot and atomic remote
imports passed Sprint 16E acceptance. The former assisted local-data migration Sprint 16F was
retired because no commercial legacy users exist; `docs/commercial-roadmap.md` supersedes it.
Sprint 17 is closed with PASS and Sprint 18 is next. Production environments, domain, transactional
SMTP, rate limiting, observability, backups, account
export/deletion, LGPD operations, secret rotation and production rollback remain future work.

## Sprint 16E remote pilot acceptance

Sprint 16E-D6 and Sprint 16E are **CLOSED with PASS**. Automated repository, mode-selection and
staging financial matrices were complemented by manual HTTPS validation of Project/Transaction
CRUD, CSV/XLSX import and reimport, concurrency conflicts, remote preferences, refresh, offline
failure without local fallback and synchronization across browsers and devices. No financial
workspace was written to `localStorage`, and no dual-write occurred.

The active-Project refresh bug found during acceptance was fixed in commit `5a03169` and manually
retested with PASS. Active selection is a per-user, per-device UI preference; financial data and
Project preferences remain remote.

## Sprint 17 remote-by-default and Auth email acceptance

Sprint 17 is **CLOSED with PASS**. The deployed Worker resolves staging as remote for every
authenticated account without consulting identity, query parameters or browser storage. The legacy
`SMART_FINANCE_REMOTE_PILOT_USER_IDS` secret was removed after deployment. A newly created account
that had never been allowlisted received an empty remote workspace; UI-created financial data
survived refresh, a new session and another browser, while a second account remained isolated.

Checkpoint 17E deployed the explicit `/auth/confirmar` flow from commit `b6e6e20`. Supabase staging
uses Mailtrap Email Sandbox as Custom SMTP, with versioned `Confirm signup` and `Reset password`
templates based on `RedirectTo` + `TokenHash`. Manual cross-context confirmation and password
recovery passed; reused links were rejected without creating sessions, tokens did not remain in the
visible URL, and `invalid_callback` did not recur. Mailtrap is staging-only and is not the future
production transactional email configuration.
