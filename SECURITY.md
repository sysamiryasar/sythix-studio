# Security

## Reporting a vulnerability

Please report privately to the repository owner (GitHub: @sysamiryasar) rather than opening a public issue. Include steps to reproduce. We aim to acknowledge reports within 7 days.

## Security model (summary)

- **Authentication:** PBKDF2-SHA256 (100k iterations, WebCrypto) password hashes. 256-bit random session tokens stored only as SHA-256 hashes, in `HttpOnly; Secure; SameSite=Lax` `__Host-` cookies with sliding 30-day expiry. Constant-time verification with a dummy hash for unknown accounts. Generic login errors.
- **Authorization:** always enforced server-side in the service layer. Roles are re-read from the database on every request; the client's view of roles is display-only. Platform roles: member < moderator < admin < owner. Community roles: member < moderator < admin < owner. Actors may only act on members ranked strictly below them.
- **Visibility:** a single SQL predicate (`visibleTo` in `services/social.ts`) governs every post read path: feeds, profiles, tags, search, single posts, media downloads and mention notifications. Blocks hide content in both directions. Restricted, private and banned-from resources return 404, not 403, so their existence isn't revealed.
- **CSRF:** state-changing requests must carry an `Origin` matching the host. WebSocket handshakes are origin-checked too, preventing cross-site WebSocket hijacking.
- **Uploads:** the type comes from the file's bytes, never from its name or MIME type. Only PNG, JPEG, GIF, WebP, MP4 and WebM are accepted, with size caps. Storage keys are server-generated. Files are served with a fixed content type, `nosniff` and a sandboxing CSP.
- **Abuse:** D1-backed rate limits on sign-up, login, posts, comments, messages, uploads, searches, reports and community creation. Optional Turnstile.
- **Headers:** a strict CSP (`script-src 'self'`), `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, a referrer policy and a permissions policy.
- **Secrets:** none are committed. Optional secrets are set with `wrangler secret put` or in the dashboard.
- **Privacy:** data export and permanent account deletion are available in Settings. We never ask for Minecraft or game passwords.

## Known gaps

- No email verification, so accounts are unverified email addresses.
- No passkeys or MFA yet.
- No automated malware scanning of uploaded media.
