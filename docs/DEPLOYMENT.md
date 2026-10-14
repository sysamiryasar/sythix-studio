# Deploying to Cloudflare

There are two supported paths:

- **A. Cloudflare dashboard (Workers Builds).** Connect the GitHub repo and click Deploy. No
  CLI, no IDs to copy. Cloudflare redeploys on every push to `main`. Best for getting started.
- **B. Tagged releases from GitHub Actions** (`release.yml`): staging first, then production
  after a required reviewer approves. See [RELEASING.md](RELEASING.md). Use one path or the
  other for production, not both.

Both work on the Workers **Free** plan for evaluation (see the limits below).

## A. Deploy from the Cloudflare dashboard

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Import a repository** → pick
   this repository.
2. Keep the defaults Cloudflare suggests:
   - **Build command:** `pnpm run build`
   - **Deploy command:** `npx wrangler deploy`
   - Production branch: `main` (also make `main` the repository's default branch on GitHub).
3. Click **Deploy**.

What happens on the first deploy, with nothing created by hand:

- Wrangler **creates** the D1 database `sythix-db` and the R2 bucket `sythix-assets`, because
  `wrangler.jsonc` names them without IDs. R2 must be enabled on the account once (Dashboard →
  R2; Cloudflare may ask for a payment method even on the free tier). If it isn't, the deploy
  fails with an R2 error. Enable it and retry.
- On the first request the Worker **applies the D1 migrations itself**, recording them in the
  same `d1_migrations` table Wrangler uses, so `wrangler d1 migrations apply` stays compatible.
  Set the var `AUTO_MIGRATE=off` to turn this off and migrate only from CI.
- `APP_URL` is taken from the request's host (e.g. `https://sythix-studio.<you>.workers.dev`).
  Set it explicitly once you use a custom domain.

Then open the site and **register**. With no email provider configured, the **first account
becomes the platform owner** and is verified immediately. Later accounts show as unverified
in **Studio → Users**, where the owner can verify them (or configure email, below). To pin
ownership to a specific address instead, set `PLATFORM_OWNER_EMAILS` before anyone registers.

Optional, any time later (Worker → **Settings → Variables and Secrets**). **Studio → Modules →
Installation setup** shows which of these are still missing:

| Add | Why |
|---|---|
| `TURNSTILE_SECRET_KEY` (secret) + `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (text) | Bot protection on sign-up and reset. Without them those forms are only rate limited |
| `RESEND_API_KEY` (secret) + `EMAIL_FROM` | Real verification and password-reset emails |
| `MS_CLIENT_ID` + `MS_CLIENT_SECRET` | Minecraft account linking ([MINECRAFT-LINKING.md](MINECRAFT-LINKING.md)) |

## B. CLI and GitHub Actions

### Resources

Production resources are created automatically by the first `wrangler deploy` (as above). For
the optional staging environment, the first `wrangler deploy --env staging` creates
`sythix-db-staging` and `sythix-assets-staging` the same way. Migrations by name:

```bash
pnpm db:migrate:production   # wrangler d1 migrations apply sythix-db --remote
pnpm db:migrate:staging      # ... sythix-db-staging --remote --env staging
```

### Manual deploy

```bash
pnpm exec wrangler login
pnpm run build               # OpenNext build
pnpm exec wrangler deploy    # production; add --env staging for staging
curl https://<host>/api/health
```

### Secrets

Set secrets with Wrangler or the dashboard; never commit them. `.dev.vars` (git-ignored) holds local values.

```bash
pnpm exec wrangler secret put TURNSTILE_SECRET_KEY
pnpm exec wrangler secret put PLATFORM_OWNER_EMAILS
pnpm exec wrangler secret put RESEND_API_KEY     # optional
pnpm exec wrangler secret put MS_CLIENT_SECRET   # optional
```

### Environment variables

| Name | Kind | Required | Purpose |
|---|---|---|---|
| `APP_ENV` | var | set in `wrangler.jsonc` | `development` \| `staging` \| `production`; controls cookie names, dev outbox, strictness |
| `APP_URL` | var | optional | Public origin for emails, OAuth redirect URI, agent instructions, CSRF allowlist. Defaults to the request host |
| `AUTO_MIGRATE` | var | optional | `off` stops the Worker from applying D1 migrations itself |
| `TURNSTILE_SECRET_KEY` | secret | recommended | Turnstile server key. Without it, sign-up and reset are protected only by rate limits (a warning is logged) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | var | with the secret | Turnstile site key (read at runtime, safe to expose) |
| `PLATFORM_OWNER_EMAILS` | secret | optional | Comma-separated emails promoted to `platform_owner` once verified. If unset and no email provider exists, the first account becomes owner |
| `RESEND_API_KEY`, `EMAIL_FROM` | secret / var | for real email | Without them, emails are **not delivered**. Messages stay in `email_outbox`, and the platform owner verifies accounts in Studio → Users |
| `MS_CLIENT_ID`, `MS_CLIENT_SECRET` | var / secret | optional | Minecraft linking ([MINECRAFT-LINKING.md](MINECRAFT-LINKING.md)) |
| `RELEASES_REPO` | var | optional | `owner/repo` checked for newer GitHub releases on the Updates page |
| `DEPLOYMENT_LABEL` | var | optional | Free-form label shown on the Updates page |

Bindings: `DB` (D1), `ASSETS_BUCKET` (R2), `ASSETS` (static assets), `WORKER_SELF_REFERENCE`.

### Turnstile

Create a widget in the Cloudflare dashboard for your hostname; set the site key as a var and the
secret as a secret. Local development uses Cloudflare's official always-pass test keys from
`.dev.vars.example`.

### GitHub Actions

Create GitHub **environments** `preview`, `staging` and `production` with secrets
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Add **required reviewers** to `production`.
This is only needed for path B; path A uses Cloudflare's own build system.

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
