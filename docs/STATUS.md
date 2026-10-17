# Status: implemented vs. planned

Legend: ✅ works and is tested · 🟡 partial · ⛔ not built / needs infrastructure

## Milestones

| # | Milestone | State |
|---|---|---|
| 0 | Architecture, design system, local dev, CI, free-tier audit | ✅ |
| 1 | Unite shell, SythiX ID, dashboard, navigation, profile settings | ✅ |
| 2 | SythiX Social | ✅ |
| 3 | SythiX Connect: communities, permissions, DMs, real-time | ✅ text; voice in M5 |
| 4 | Minecraft Database | ⛔ planned |
| 5 | Voice/video with a real media backend | ⛔ needs an SFU + TURN (cost approval) |
| 6 | SythiX Studio foundation | 🟡 only Home widget customization |
| 7 | Server Hosting management | ⛔ needs compute infrastructure |
| 8 | SythiX AI | ⛔ planned |
| 9 | Living Graph, Instant Spaces, tournaments, Quest Engine | ⛔ planned |
| 10 | Extensions, Worlds, production readiness | ⛔ planned |

## Feature detail

**SythiX ID:** ✅ register/login/logout · ✅ sessions list and revoke · ✅ password change (signs out other sessions) · ✅ profile, avatar, banner, accent · ✅ privacy (profile visibility, DM policy, mentions, activity) · ✅ appearance (theme, motion, nav) · ✅ data export · ✅ account deletion · ✅ first-owner bootstrap · ⛔ email verification and password-reset emails (no email provider) · ⛔ passkeys/MFA · ⛔ connected game accounts.

**Shell:** ✅ nav rail (collapsible, Ctrl+B) · ✅ mobile drawer · ✅ breadcrumbs · ✅ Everything Command (Ctrl/⌘+K) · ✅ live notification badge (WebSocket plus polling fallback) · ✅ customizable Home · ✅ light/dark/system · ✅ reduced motion · ✅ skip link and keyboard navigation.

**Social:** ✅ posts with images and video · ✅ visibility · ✅ Home/Following/Discover feeds with pagination · ✅ follows (and removing followers) · ✅ reactions · ✅ threaded comments · ✅ reposts · ✅ bookmarks · ✅ hashtags, trending · ✅ mentions · ✅ profile posts and media tabs · ✅ search · ✅ edit and delete · ✅ block and report · ⛔ quote posts · ⛔ collections beyond bookmarks · ⛔ link previews · ⛔ community-scoped posting UI (the API supports `communityId`).

**Connect:** ✅ communities (public/private) · ✅ invites with expiry and max uses · ✅ roles, kick, ban, unban (API) · ✅ text, announcement and restricted channels · ✅ messages with edit, delete, pin, reactions, replies · ✅ message search · ✅ unread state · ✅ DMs and group DMs with DM policy · ✅ real-time delivery, typing, presence · 🟡 voice channels show an unavailable state · ⛔ threads and forums · ⛔ attachments in chat · ⛔ per-channel notification settings.

**Moderation:** ✅ report queue · ✅ remove content · ✅ hide/restore posts · ✅ suspend/reinstate · ✅ platform roles · ✅ audit log.

## Verification performed for 0.1.0

- `pnpm lint`, `pnpm typecheck` (client and worker), `pnpm test` (43 tests) and `pnpm build` all pass.
- `wrangler dev` with a fresh local D1 applied the migrations itself.
- The Playwright end-to-end test passes in Chromium against workerd, including real-time chat between two browsers.
- **Not yet done:** a deploy to a real Cloudflare account. No account credentials are available to this repository's automation.
