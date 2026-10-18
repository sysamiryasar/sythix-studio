# Deployment

## Cloudflare dashboard (recommended)

1. **Workers & Pages → Create → Import a repository** → choose this repo.
2. Set the project name to `sythix-unite` and keep the defaults:
   - Build command: `pnpm run build`
   - Deploy command: `npx wrangler deploy`
   - Branch: `main`
3. Click **Deploy**. Wrangler creates the D1 database `sythix-unite-db` and the `RealtimeRoom` Durable Object class.
4. Open the `*.workers.dev` URL and register. **The first account becomes the platform owner.** To pin ownership to a specific address instead, set `OWNER_EMAILS` before anyone registers.

Every push to `main` redeploys automatically.

## Photo and video storage (Supabase, free)

Without storage the app works, but photo/video uploads and avatars are disabled.

1. Create a free account at https://supabase.com and a **New project** (any name and region).
2. In the project, open **Project Settings → API Keys** and copy:
   - the **Project URL** (e.g. `https://abcd1234.supabase.co`), and
   - a **secret key** (`sb_secret_…`), or the legacy **service_role** key. Treat it like a password.
3. In Cloudflare: **Workers & Pages → sythix-unite → Settings → Variables and Secrets**, add:
   - `SUPABASE_URL` (Text) = the Project URL
   - `SUPABASE_SERVICE_KEY` (**Secret**) = the secret key
   - optional `SUPABASE_BUCKET` (Text), default `sythix-media`
4. Click **Deploy** to apply the variables. The first upload creates the bucket as **private** automatically.

Free Supabase projects pause after about a week of inactivity; restore the project from the Supabase dashboard if uploads start failing. To use Cloudflare R2 instead, see FREE_TIER_AUDIT.md.

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
| `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` | var + secret | for uploads | Supabase Storage for photos, videos and avatars. `SUPABASE_BUCKET` optional (default `sythix-media`). |
| `AUTO_MIGRATE` | var | optional | `off` disables runtime migrations (then run `pnpm db:migrate:remote`). |
| `REALTIME_APP_ID`, `REALTIME_APP_TOKEN` | secret | future | Cloudflare Realtime credentials for voice/video (Milestone 5). Calls stay unavailable even when these are set, until the client is built. |

## Rollback

`pnpm exec wrangler deployments list` then `pnpm exec wrangler rollback <version-id>`. Migrations are additive, so rolling back the Worker is safe. Back up D1 with `wrangler d1 export sythix-unite-db --remote --output backup.sql`.

## Upgrading from SythiX Studio

SythiX Unite uses a **new** Worker name (`sythix-unite`) and a new D1 database name, so it does not touch a previous `sythix-studio` deployment or its data. Delete the old Worker, database and bucket from the dashboard when you no longer need them. That step is manual on purpose.
