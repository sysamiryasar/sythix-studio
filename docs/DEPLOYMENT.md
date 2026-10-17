# Deployment

## Cloudflare dashboard (recommended)

1. **Enable R2 once:** Dashboard → R2 → enable. Cloudflare may ask for a payment method; see FREE_TIER_AUDIT.md.
2. **Workers & Pages → Create → Import a repository** → choose this repo.
3. Keep the defaults:
   - Build command: `pnpm run build`
   - Deploy command: `npx wrangler deploy`
   - Branch: `main`
4. Click **Deploy**. Wrangler creates the D1 database `sythix-unite-db`, the R2 bucket `sythix-unite-media` and the `RealtimeRoom` Durable Object class.
5. Open the `*.workers.dev` URL and register. **The first account becomes the platform owner.** To pin ownership to a specific address instead, set `OWNER_EMAILS` before anyone registers.

Every push to `main` redeploys automatically.

## CLI

```bash
pnpm exec wrangler login
pnpm run deploy                 # build + wrangler deploy
pnpm db:migrate:remote          # optional; the Worker also migrates itself
```

## Environment variables and secrets

| Name | Kind | Required | Purpose |
|---|---|---|---|
| `APP_ENV` | var | set in `wrangler.jsonc` | `production` (Secure `__Host-` cookie) or `development` (plain cookie on http://localhost). |
| `OWNER_EMAILS` | secret | optional | Comma-separated emails that become `owner` on sign-up. If unset, the first account is owner. |
| `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` | var + secret | recommended | Both together turn on a Cloudflare Turnstile check on sign-up (the widget appears on the form). Without them, sign-up is protected by rate limits only. |
| `AUTO_MIGRATE` | var | optional | `off` disables runtime migrations (then run `pnpm db:migrate:remote`). |
| `REALTIME_APP_ID`, `REALTIME_APP_TOKEN` | secret | future | Cloudflare Realtime credentials for voice/video (Milestone 5). Calls stay unavailable even when these are set, until the client is built. |

## Rollback

`pnpm exec wrangler deployments list` then `pnpm exec wrangler rollback <version-id>`. Migrations are additive, so rolling back the Worker is safe. Back up D1 with `wrangler d1 export sythix-unite-db --remote --output backup.sql`.

## Upgrading from SythiX Studio

SythiX Unite uses a **new** Worker name (`sythix-unite`) and new D1 and R2 names, so it does not touch a previous `sythix-studio` deployment or its data. Delete the old Worker, database and bucket from the dashboard when you no longer need them. That step is manual on purpose.
