# SythiX Unite

**Everything. Everyone. United.** · *One identity. One platform. Infinite possibilities.*

SythiX Unite is the all-in-one platform of the SythiX ecosystem. It brings social networking, communities with real-time chat, and, over time, Minecraft discovery, server management, creator tools, gaming and AI together under one SythiX ID.

> **Honest status.** This is version 0.1.0. SythiX ID, the Unite shell, SythiX Social and SythiX Connect (text and real-time) work and are tested. Voice/video, Minecraft Database, Server Hosting, Studio, Gaming, AI, Worlds and Extensions are **not built yet**. The app shows them as roadmap entries and never fakes them. See [docs/STATUS.md](docs/STATUS.md).

## What works today

| Area | Features |
|---|---|
| **SythiX ID** | Registration and sign-in (PBKDF2, hashed session tokens), profile with avatar, banner and accent, privacy (profile visibility, DM policy, mentions, activity), appearance (dark/light/system, reduced motion), sessions, password change, JSON data export, permanent account deletion. The first account becomes the platform owner. |
| **Unite shell** | Collapsible navigation rail, breadcrumbs, the **Everything Command** palette (Ctrl/⌘+K: permission-aware search plus actions), live notification badge, customizable Home dashboard (show, hide and reorder widgets), responsive mobile layout. |
| **SythiX Social** | Posts with up to 4 images or videos, public/followers/private visibility, Home/Following/Discover feeds with cursor pagination, follows, 5 reaction types, threaded comments, reposts, bookmarks, #hashtags and trending, @mentions, profile media gallery, search. |
| **SythiX Connect** | Communities (public or invite-only), text, announcement and restricted channels, roles (owner/admin/moderator/member) with server-side permission checks, invites, kick/ban, direct and group messages. Real-time delivery, typing indicators and presence over WebSockets (Durable Objects). Edit, delete, pin, emoji reactions, reply, message search, unread state. |
| **Safety** | Blocking (two-way content hiding), reports on users, posts, comments, messages and communities, a moderation queue, content hiding, account suspension, role management and an audit log. Rate limits on every write path, CSRF origin checks, cross-site WebSocket rejection, byte-level upload validation, CSP and security headers. |

## Stack

React 19 + TypeScript + Vite + Tailwind CSS 4 (client) · Hono on Cloudflare Workers (API) · D1 (database) · Supabase Storage or Cloudflare R2 (media) · Durable Objects with WebSocket Hibernation (real-time) · Vitest and Playwright (tests) · GitHub Actions (CI). One Worker serves the app and the API.

```
src/
  shared/    types, zod schemas, permissions, product areas, changelog (client + server)
  worker/    Hono API: routes/, services/ (account, social, connect, media, moderation, search), realtime/ (Durable Object), lib/
  client/    React app: pages/, components/ (shell, command palette, social, chat, ui), lib/ (api, realtime, session)
migrations/  D1 schema (applied automatically on first request)
tests/       Vitest integration tests: real SQL on node:sqlite, in-memory R2, fake realtime
e2e/         Playwright browser test against real workerd
docs/        architecture, deployment, status, security
```

## Run it locally

Requirements: Node.js ≥ 22.12 and pnpm 10.

```bash
pnpm install
pnpm dev            # API (wrangler dev on :8787) + Vite (http://localhost:5173)
```

The local D1 database migrates itself on the first request. Register at http://localhost:5173/register; the first account becomes the platform owner.

```bash
pnpm check          # lint + typecheck + tests + production build
pnpm preview        # build, then run the real Worker (workerd) at http://localhost:8787
pnpm test:e2e       # browser test; needs `pnpm preview` running on a fresh local database
```

## Deploy to Cloudflare

Cloudflare dashboard → **Workers & Pages → Create → Import a repository** → this repository, project name `sythix-unite`. Keep the defaults: build `pnpm run build`, deploy `npx wrangler deploy`. D1 and the Durable Object are created on the first deploy. Photos and videos are stored in **Supabase Storage** (free tier): add `SUPABASE_URL` and the `SUPABASE_SERVICE_KEY` secret. Until then uploads are disabled and everything else works. Full guide: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): system design, data model, permissions, real-time, product-area roadmap
- [docs/STATUS.md](docs/STATUS.md): implemented vs. planned, with known limitations
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): deploying and environment variables
- [SECURITY.md](SECURITY.md): security model and reporting
- [FREE_TIER_AUDIT.md](FREE_TIER_AUDIT.md): every service, its free allowance and its limits
- [MONTHLY_REVAMPS.md](MONTHLY_REVAMPS.md): release process and roadmap
- [CHANGELOG.md](CHANGELOG.md)
