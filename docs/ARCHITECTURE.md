# Architecture

## Brand hierarchy → code

SythiX Unite is one application. The product areas are sections of it, not separate apps: they share identity, design tokens, navigation, notifications, permissions and the API.

| Area | Where it lives | State |
|---|---|---|
| SythiX ID | `services/account.ts`, `services/users.ts`, `lib/session.ts`, `pages/settings.tsx` | Live |
| SythiX Social | `services/social.ts`, `services/media.ts`, `routes/social.ts`, `components/social.tsx`, `pages/social.tsx` | Live |
| SythiX Connect | `services/connect.ts`, `realtime/room.ts`, `routes/connect.ts`, `components/chat.tsx`, `pages/connect.tsx` | Live (text). Voice needs an SFU |
| Moderation (platform) | `services/moderation.ts`, `pages/platform.tsx` | Live |
| Minecraft DB, Hosting, Studio, Gaming, AI, Worlds, Extensions | `src/shared/areas.ts` (status only) | Planned; see `MONTHLY_REVAMPS.md` |

`src/shared/areas.ts` is the single source of truth for each area's honest status. The navigation, Home and the area pages all render from it.

## Runtime

```
Browser (React SPA) ──HTTPS──► Cloudflare Worker (src/worker/index.ts)
                                 ├─ /api/*  → Hono app (routes → services → D1/R2)
                                 ├─ /api/realtime?room=… → auth → Durable Object (RealtimeRoom)
                                 └─ everything else → static assets (SPA fallback)
                               Cron (daily 03:17 UTC) → maintenance
```

- **One Worker** serves both the SPA (assets binding, `run_worker_first` only for `/api/*`) and the API. This keeps Cloudflare's default "Import a repository" settings working.
- **D1** stores all relational data. Each `migrations/*.sql` file is bundled into the Worker by `scripts/gen-migrations.mjs` and applied on the first request (`lib/migrate.ts`), tracked in Wrangler's `d1_migrations` table.
- **R2** stores media at server-generated keys (`media/<user>/<id>`, `avatars/<user>/<id>`). Downloads go through the API, which authorizes against the post's visibility.
- **Durable Objects:** one `RealtimeRoom` per room (`channel:<id>`, `conv:<id>`, `user:<id>`). The Worker authenticates and authorizes before forwarding the WebSocket. The object fans out events and computes presence. It uses the Hibernation API to avoid duration charges for idle sockets.

## Request lifecycle

`createApp()` middleware (`src/worker/app.ts`) runs in this order:
1. Ensure migrations have run.
2. Build the request context.
3. CSRF origin check on non-GET requests.
4. Resolve the session cookie.
5. Per-user mutation rate limit.

Routes validate input with zod schemas from `src/shared/schemas.ts`, which the client forms also use. Services do the authorization and data work. Errors become `{ error: { code, message, details } }` with the matching HTTP status.

## Real-time design

Writes always go to D1 first. After the write succeeds, the service calls `publish(room, event)`, an RPC to the room's Durable Object, through `waitUntil`. Delivery is best-effort; the database remains the source of truth. Clients reconnect with exponential backoff and refetch history on reconnect, so nothing sent while they were offline is lost. Typing indicators are sent directly by clients to the room, throttled to one every 2 s per connection. Presence respects the "Show activity" privacy setting.

**Voice and video are separate from this.** WebSockets only carry signalling. Media needs a WebRTC SFU plus TURN (planned: Cloudflare Realtime). Until those are configured, `/api/voice/status` reports unavailable and voice channels say so; calls are never simulated.

## Data model (summary)

- **Identity:** `users`, `sessions` (token hash only), `profiles`, `preferences`, `user_blocks`.
- **Social:** `follows`, `posts` (with denormalised counters, `repost_of`, `status` visible/hidden), `media`, `reactions` (one per user per post), `comments` (one nesting level), `bookmarks`, `post_tags`.
- **Connect:** `communities`, `community_members` (role), `community_bans`, `community_invites`, `channels` (`min_role` gates viewing), `conversations` (`dm_key` keeps one 1:1 conversation per pair), `conversation_members`, `messages` (belongs to exactly one channel or conversation), `message_reactions`, `read_states`.
- **Platform:** `notifications`, `reports`, `audit_log`, `rate_limits`.

## Permissions

Defined once in `src/shared/permissions.ts` and enforced in services:
- **Platform:** member < moderator (review reports, hide content) < admin (suspend users, audit log) < owner (set roles).
- **Community:** member (view, post, invite) < moderator (pin, delete any message, kick, post announcements) < admin (ban, roles, channels, settings) < owner (delete community).
- An actor may only act on accounts ranked strictly below them.

## Post visibility

`visibleTo(viewer)` in `services/social.ts` is one SQL predicate used by every read path. A post is visible when its author is active, it isn't hidden (authors still see their own hidden posts, flagged), and neither user has blocked the other. In addition, at least one of these must hold:
- the viewer is the author;
- the post is public and the author's profile is public;
- the post is public or followers-only, the viewer follows the author, and the author's profile isn't private;
- the post is a community post and the viewer is a member of that community.

## Discover algorithm

Public original posts from the last 7 days by accounts the viewer doesn't follow, ranked by `(1 + 2·reactions + 3·comments + 4·reposts) / (age_hours + 2)²`. It is shown to users in plain words on the Discover tab.

## Design system

Tokens are in `src/client/styles.css`: an obsidian dark theme with violet, cyan and magenta accents, plus a full light theme. Contrast is chosen to be at least 4.5:1 for text. Tokens are exposed to Tailwind through `@theme inline`. `data-theme` and `data-motion` on `<html>` follow user preferences. Primitives are in `components/ui.tsx`: Button, Field, Input, Select, Toggle, Panel, Tabs, Dialog (native `<dialog>`), Toast, Avatar, Badge, EmptyState, ErrorState and Spinner. The logo mark is original SVG artwork (`components/logo.tsx`).

## Testing

- `tests/*.test.ts` run the real Hono app and real SQL against node:sqlite (a D1 adapter), an in-memory R2 and a fake realtime namespace that records broadcasts.
- `e2e/smoke.spec.ts` drives two real browsers against `wrangler dev` (workerd, local D1, R2 and Durable Objects). It covers sign-up, posting with an image, mentions, follows, reactions, tags, search, community invites, two-way real-time chat, DMs and theme switching.

## Planned integrations (designed, not built)

- **Minecraft Database:** adapters per data source. Mojang profile API for UUID ↔ name. Java server list ping through a provider that can open TCP; Workers' `connect()` is a candidate and must be verified first. Data is labelled "verified" vs "user-submitted" with last-checked times. Bedrock comes later.
- **Server Hosting:** a provider interface (`createServer`, `power`, `console`, `files`, `backups`) implemented first by a Pterodactyl-panel adapter or a scoped self-hosted agent. Typed actions only, signed requests, quotas and audit. It never exposes a shell, Docker or host credentials to the browser.
- **AI:** a provider interface with a clearly labelled local mock. Permission-aware retrieval goes through the same `visibleTo` / membership checks. Every action needs explicit user confirmation. Usage caps and timeouts apply.
