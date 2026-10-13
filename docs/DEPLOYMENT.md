# Deploying to Cloudflare

Everything below uses Wrangler and works on the Workers **Free** plan for evaluation (see limits).
Nothing deploys automatically from `main`; production goes through the tagged release workflow
([RELEASING.md](RELEASING.md)).

## 1. Prerequisites

- A Cloudflare account and `pnpm exec wrangler login` (or an API token, below).
- A GitHub repository with Actions enabled.

## 2. Create resources (once per environment)

```bash
# Staging
pnpm exec wrangler d1 create sythix-db-staging
pnpm exec wrangler r2 bucket create sythix-assets-staging
# Production
pnpm exec wrangler d1 create sythix-db
pnpm exec wrangler r2 bucket create sythix-assets
```

Copy each printed `database_id` into `wrangler.jsonc` (`env.staging` / `env.production`), and set
`APP_URL` for each environment to its public URL. Bindings are not inherited between
environments, which is why each block declares its own D1, R2, vars and cron.

## 3. Secrets

Set secrets with Wrangler; never commit them. `.dev.vars` (git-ignored) holds local values.

```bash
pnpm exec wrangler secret put TURNSTILE_SECRET_KEY --env production
pnpm exec wrangler secret put PLATFORM_OWNER_EMAILS --env production
pnpm exec wrangler secret put RESEND_API_KEY --env production     # optional
pnpm exec wrangler secret put MS_CLIENT_SECRET --env production   # optional
```

### Environment variables

| Name | Kind | Required | Purpose |
|---|---|---|---|
| `APP_ENV` | var | yes | `development` \| `staging` \| `production`; controls cookie names, dev outbox, strictness |
| `APP_URL` | var | yes | Public origin; used in emails, OAuth redirect URI, agent instructions, CSRF allowlist |
| `TURNSTILE_SECRET_KEY` | secret | production | Turnstile server key. Missing in production = registration/reset refused |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | var | production | Turnstile site key (read at runtime, safe to expose) |
| `PLATFORM_OWNER_EMAILS` | secret | recommended | Comma-separated emails promoted to `platform_owner` once verified |
| `RESEND_API_KEY`, `EMAIL_FROM` | secret / var | for real email | Without them, production emails are **not delivered** (logged as an error) |
| `MS_CLIENT_ID`, `MS_CLIENT_SECRET` | var / secret | optional | Minecraft linking ([MINECRAFT-LINKING.md](MINECRAFT-LINKING.md)) |
| `RELEASES_REPO` | var | optional | `owner/repo` checked for newer GitHub releases on the Updates page |
| `DEPLOYMENT_LABEL` | var | optional | Free-form label shown on the Updates page |

Bindings: `DB` (D1), `ASSETS_BUCKET` (R2), `ASSETS` (static assets), `WORKER_SELF_REFERENCE`.

## 4. Turnstile

Create a widget in the Cloudflare dashboard for your hostname; set the site key as a var and the
secret as a secret. Local development uses Cloudflare's official always-pass test keys from
`.dev.vars.example`.

## 5. First deploy (manual, staging)

```bash
pnpm db:migrate:staging
pnpm exec opennextjs-cloudflare build
pnpm exec opennextjs-cloudflare deploy --env staging
curl https://<staging-host>/api/health
```

Register with an address listed in `PLATFORM_OWNER_EMAILS`, verify it, and you are the platform
owner.

## 6. GitHub Actions

Create GitHub **environments** `preview`, `staging` and `production` with secrets
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Add **required reviewers** to `production`.

Least-privilege API token (Account → API Tokens → Custom):
`Workers Scripts: Edit`, `D1: Edit`, `Workers R2 Storage: Edit` (only if the workflow manages
buckets; otherwise omit), `Account Settings: Read`. Scope it to the one account. Use separate
tokens for staging/preview and production.

- `ci.yml` — every PR: lint, typecheck (app + agent), tests, dependency audit, fresh-D1
  migration check, OpenNext build, Worker bundling dry run, agent build, secret scan; optional
  preview upload (`wrangler versions upload`, no traffic shift) when the preview token exists.
- `release.yml` — on `vX.Y.Z` tags: verify version/changelog, test, migrate + deploy staging, then
  (after manual approval) bookmark D1 Time Travel, migrate + deploy production, publish the release.

## Free-tier limits to know

| Resource | Free plan (check current Cloudflare docs) | SythiX usage |
|---|---|---|
| Worker requests | 100k/day | Each agent sends ~8,640 heartbeats/day per server (10s interval) — about 10 servers per free account |
| Worker CPU | 10 ms per request | PBKDF2 login/registration is the heaviest path; if you see CPU-limit errors on login, use the Workers Paid plan |
| D1 | 5 GB, 5M rows read/day, 100k writes/day | Heartbeats write ~3–5 rows each; console retention and pruning keep tables bounded |
| R2 | 10 GB, 1M Class A ops/month | Textures ≤256 KB, models ≤64 KB, exports typically KBs |
| Cron Triggers | available | One trigger, every minute |

For more than a handful of servers, use Workers Paid and/or raise `HEARTBEAT_INTERVAL_MS` in `src/modules/serveros/constants.ts` (agents adopt the interval the server returns).
