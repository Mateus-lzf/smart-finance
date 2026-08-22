# Cloudflare Workers staging runbook

The Smart Finance staging application uses Cloudflare Workers with Static Assets. Checkpoint 15D-A
prepares the repository and performs only a local Wrangler dry-run. It does not log in, deploy,
create a Worker, configure Access, or modify Supabase.

## Runtime contract

- Nitro compiles `src/server.ts` to `.output/server/index.mjs`.
- Static assets are emitted to `.output/public`.
- `wrangler.jsonc` is the versioned deployment source of truth.
- Only the named `staging` environment enables `workers.dev`.
- The Worker is always named `smart-finance-staging`.
- Versioned preview URLs are disabled.
- No production environment exists in this checkpoint.

The runtime receives only `SMART_FINANCE_ENVIRONMENT=staging`. Supabase URL and publishable key are
browser-safe build-time values loaded by `vite build --mode staging`. The Worker has no database
password, connection string, service role, secret key, or admin key.

## Local preparation and dry-run

```sh
npm run build:staging
npm run test:cloudflare:staging
npm run cloudflare:staging:plan
```

`cloudflare:staging:plan` validates the committed Wrangler contract, Supabase staging URL/ref/link,
Nitro artifacts, and then runs Wrangler with `deploy --dry-run`. It writes only local output under
`.wrangler/staging-dry-run` and neither authenticates nor uploads anything.

## Future remote identity check

Checkpoint 15D-B will copy `.env.cloudflare.staging.example` to the ignored
`.env.cloudflare.staging.local` and provide the approved account ID. Only then may the operator run:

```sh
npm run cloudflare:staging:check
```

That command calls `wrangler whoami` and refuses an authenticated account that does not contain the
exact approved account ID. The env file rejects tokens, API keys, secrets, passwords, database URLs,
and service-role variables.

## Future deploy guard

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
separate approval in Checkpoint 15D-B.

## Security before first deploy

- Staging responses receive `X-Robots-Tag: noindex, nofollow, noarchive`.
- `/robots.txt` disallows every crawler only when the Worker runtime environment is staging.
- Error logging redacts authorization values, cookies, auth/reset codes, JWTs and email addresses.
- Cloudflare Access remains a manual 15D-B action and is the actual access-control boundary;
  crawler directives are defense in depth only.
- Logs must never include request bodies, passwords, cookies, full callback URLs, or financial data.

## Rollback boundary

Before the first deploy there is nothing remote to roll back. If build, size, startup, compatibility,
or secret auditing fails, stop in 15D-A. Do not authenticate or create the Worker to work around a
local validation failure.
