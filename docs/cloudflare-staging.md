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

The financial UI still uses per-user localStorage. The deployed Worker does not read, migrate or
dual-write product projects and transactions to Supabase.

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

This staging deployment is not a production launch. Remote financial persistence, assisted local
data migration, atomic remote imports, production environments, domain, SMTP, rate limiting,
observability, backups, account export/deletion, LGPD operations, secret rotation and production
rollback remain future work.
