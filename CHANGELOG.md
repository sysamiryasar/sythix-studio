# Changelog

All notable changes to SythiX Unite. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: SemVer.

## [Unreleased]

### Changed
- **Media storage moved to Supabase Storage** (free tier, no card) through a storage adapter (`src/worker/lib/storage.ts`). Cloudflare R2 remains supported as an opt-in binding. The R2 binding was removed from `wrangler.jsonc` because the first Cloudflare deploy failed with "R2 bucket not found".
- Without any storage configured, the app deploys and works; uploads and avatars are disabled with a clear message.
- The Supabase bucket is created private on the first upload; all downloads still go through the API's authorization.

## [0.1.0] - 2026-10-17

The repository was rebuilt from scratch as SythiX Unite. The previous SythiX Studio code remains in git history (up to commit `af0b687`).

### Added
- **SythiX ID**: registration, sign-in, sessions, profile (avatar, banner, accent, bio, links), privacy controls, appearance preferences, password change, data export, account deletion; first-account owner bootstrap; optional `OWNER_EMAILS` and Turnstile.
- **Unite shell**: navigation rail with product areas and honest status, breadcrumbs, Everything Command palette, live notifications, customizable Home dashboard, light/dark/system themes, reduced motion.
- **SythiX Social**: posts with images and video (R2), visibility, three feeds, follows, reactions, threaded comments, reposts, bookmarks, hashtags, trending, mentions, profile media, search, blocking, reporting.
- **SythiX Connect**: communities, channels (text/announcement/voice placeholder/restricted), roles, invites, bans, direct and group messages, real-time delivery, typing and presence via Durable Objects, pins, reactions, message search, unread state.
- **Moderation**: report queue, content removal, account suspension, platform roles, audit log.
- Self-applying D1 migrations, daily maintenance cron, security headers and CSP.
- 43 integration tests, 1 browser end-to-end test, CI workflow.
- `FREE_TIER_AUDIT.md`, `MONTHLY_REVAMPS.md`, architecture, deployment and status docs.

### Known limitations
- Voice, video and screen sharing are unavailable; no media server is configured.
- Minecraft Database, Server Hosting, Studio, Gaming, AI, Worlds and Extensions are not built.
- No email delivery: no email verification or password-reset emails yet.
