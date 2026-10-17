# Free-tier audit

**Budget: $0/month.** This file records every external service SythiX Unite uses or plans to use, what is free, and what happens when a limit is reached. Nothing here is purchased or enabled automatically. Paid tiers, domains, AI usage or billable infrastructure need explicit approval from the project owner.

Last verified: **2026-10-17**, against the official pages linked below. Re-verify monthly as part of [MONTHLY_REVAMPS.md](MONTHLY_REVAMPS.md). Prices and quotas change.

## Services in use

### Cloudflare Workers: API and static site

| | |
|---|---|
| **Purpose** | Runs the API (`src/worker`) and serves the React app's static assets. |
| **Free allowance** | 100,000 requests/day; 10 ms CPU per invocation. Static asset requests are free and unlimited, and do not count toward the 100k. |
| **Source** | https://developers.cloudflare.com/workers/platform/pricing/ |
| **Payment requirement** | None for the Free plan. |
| **When exceeded** | Requests fail with errors until 00:00 UTC. |
| **Risks** | PBKDF2 password hashing (100k iterations) is the heaviest operation and can approach the 10 ms CPU limit on sign-up and login. Each API call counts as a request. |
| **Fallback / migration** | Workers Paid ($5/month, needs approval) raises the limits. The code has no Free-plan-specific logic, so moving to Paid needs no code changes. |

### Cloudflare D1: relational database

| | |
|---|---|
| **Purpose** | Accounts, sessions, posts, comments, follows, communities, messages, notifications and the audit log. |
| **Free allowance** | 5 million rows read/day, 100,000 rows written/day, 5 GB storage in total. |
| **Source** | https://developers.cloudflare.com/d1/platform/pricing/ |
| **Payment requirement** | None. |
| **When exceeded** | Queries return errors until 00:00 UTC. At the storage cap, writes fail until data is deleted. |
| **Risks** | Index writes count as extra rows written. Chat and rate-limit counters are write-heavy. 100k writes/day supports a small community, not a large public launch. |
| **Guardrails in code** | Per-user rate limits on posts, comments, messages, uploads, searches and reports (`src/worker/lib/rate-limit.ts`). Daily cleanup of expired sessions, rate-limit rows and old read notifications. |
| **Fallback / migration** | Workers Paid includes 50M writes/month. Schema and SQL are portable SQLite, which can be exported with `wrangler d1 export`. |

### Cloudflare R2: media storage

| | |
|---|---|
| **Purpose** | Images, videos and avatars uploaded by users. |
| **Free allowance** | 10 GB-month of storage, 1 million Class A operations/month, 10 million Class B operations/month (Standard storage only). Egress is free. |
| **Source** | https://developers.cloudflare.com/r2/pricing/ |
| **Payment requirement** | ⚠️ Cloudflare may ask for a payment method before R2 can be enabled on an account, even on the free tier. This was not confirmed from official docs, so check in the dashboard. Without R2, uploads fail but everything else works. |
| **When exceeded** | Usage above the free allowance is billed if a payment method is on file. |
| **Risks** | Video uploads (25 MB cap each) fill 10 GB quickly. |
| **Guardrails in code** | Uploads are capped at 5 MB per image, 25 MB per video, 2 MB per avatar and 40 per user per hour. Files are type-checked by their bytes. Uploads never attached to a post are swept after 24 hours. |
| **Fallback / migration** | Lower the caps in `src/shared/schemas.ts`, or disable video. Any S3-compatible store works by replacing `services/media.ts`. |

### Cloudflare Durable Objects (SQLite-backed): real-time rooms

| | |
|---|---|
| **Purpose** | One object per chat room, DM or user notification stream. Fans out WebSocket events and tracks presence and typing. |
| **Free allowance** | 100,000 requests/day, 13,000 GB-s duration/day, 5M rows read/day, 100k rows written/day, 5 GB storage. Only SQLite-backed classes are available on the Free plan. |
| **Source** | https://developers.cloudflare.com/durable-objects/platform/pricing/ |
| **Payment requirement** | None. |
| **When exceeded** | Operations fail until 00:00 UTC. Messages are still saved to D1, but live delivery stops and clients catch up on reconnect. |
| **Risks** | Each WebSocket connection counts as a request. Incoming WebSocket messages are billed at 20:1 (typing pings and keep-alives). |
| **Guardrails in code** | Uses the WebSocket Hibernation API, so idle sockets don't accrue duration. Typing events are throttled to one per 2 s per connection. Clients ping every 25 s and back off exponentially on reconnect. |
| **Fallback / migration** | Clients already refetch history on reconnect. If the quota is exhausted, chat degrades to refresh-to-see. |

### GitHub Actions: CI

| | |
|---|---|
| **Purpose** | Lint, type-check, test and build on every pull request. |
| **Free allowance** | Free for public repositories. Private repositories get a monthly minutes allowance that depends on the account plan. |
| **Source** | https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions |
| **Risks** | Private repos can run out of minutes. The CI job takes about 2 minutes. |
| **Fallback** | Run `pnpm check` locally. |

## Optional services (off by default)

| Service | Purpose | Free allowance | Status |
|---|---|---|---|
| Cloudflare Turnstile | Bot check on sign-up | Free | Off. Enable by setting `TURNSTILE_SECRET_KEY`; until then sign-up is protected only by rate limits. Free-plan limits were not re-verified this cycle. |
| Cloudflare Realtime (SFU + TURN) | Voice, video, screen share | 1,000 GB/month free egress, shared across SFU and TURN; then $0.05/GB. TURN is free when used with the SFU. Source: https://developers.cloudflare.com/realtime/sfu/pricing/ | **Not integrated.** Voice channels show an "unavailable" state. Milestone 5. |
| AI provider | SythiX AI | Varies by provider. No provider is selected. | **Not integrated.** Needs approval before any provider that costs money. Milestone 8. |
| Minecraft server hosting | Running game servers | **No free option is assumed.** | **Not available.** Needs real compute (a VPS or dedicated node plus a panel such as Pterodactyl). Cannot run on Workers. Milestone 7. |

## What is *not* promised

- Unlimited users, storage, video, AI or hosting.
- Free public Minecraft server hosting.
- Voice and video calls, until an SFU is configured and its costs are approved.

## Capacity estimate on the free tier (rough)

About **50–200 daily active users**, assuming moderate posting and chat, before D1 writes (100k/day) or Worker requests (100k/day) become the bottleneck. Watch the Cloudflare dashboard's usage graphs. The first sign of trouble is `rate_limited` or 5xx errors around peak hours.
