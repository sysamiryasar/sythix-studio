# Security architecture

| Concern | Control | Where |
|---|---|---|
| Password storage | PBKDF2-HMAC-SHA256, 100k iterations, 16-byte salt, WebCrypto; versioned format with rehash-on-login | `src/lib/security/crypto.ts` |
| Account enumeration | Registration returns the same response for existing emails (owner is emailed instead); login uses a generic error and hashes a dummy value for unknown accounts; reset always reports “sent if applicable” | `src/lib/auth/service.ts` |
| Sessions | 256-bit random token, SHA-256 at rest, `HttpOnly`, `SameSite=Lax`, `Secure` + `__Host-` prefix outside development, 30-day sliding expiry, per-session and bulk revocation, revocation on password reset/change | `src/lib/auth/session.ts` |
| Email & reset tokens | Single-use, hashed, short-lived (24h / 1h), newer token invalidates older; verification needs an explicit POST so link scanners can't consume it | `service.ts`, `verify-email` page |
| CSRF | SameSite cookies + strict `Origin`/`Referer` host match on every non-GET + JSON content type required | `src/lib/security/origin.ts`, `http/api.ts` |
| Abuse | D1 fixed-window rate limits (login per IP and per account, registration, reset, uploads, exports, server commands, reports, agent heartbeats); Turnstile on registration and reset (mandatory in production) | `rate-limit.ts`, `turnstile.ts` |
| Authorization | Every service checks permissions server-side; scoped RBAC; server access only via server membership; deployments need both project and server roles; non-members get 404 | `src/lib/authz/*`, services |
| Input validation | Zod on every body; JSON body size cap (256 KB); identifiers and file names allowlisted | `schema.ts`, `protocol.ts`, `validation.ts` |
| SQL injection | Parameterised statements only; the two dynamic table names come from fixed maps | `src/lib/db/sql.ts` |
| Uploads | Content validated from bytes (PNG signature/IHDR/IEND, dimensions; model JSON structure, coordinates, parents, texture references); size checked before buffering; stored under server-generated R2 keys; served with fixed content type, `nosniff` and `default-src 'none'` | `forgeos/models.ts`, `assets.ts`, asset route |
| Archives | Exports are generated, never extracted server-side; the agent verifies size + SHA-256, requires `pack.mcmeta`, rejects absolute/`..` entries and writes only `sythix-*.zip` into the datapacks folder | `export/verify.ts`, `agent/src/executor.ts` |
| Path traversal | Agent sandbox resolves real paths, rejects `..`, absolute paths and symlinks; allowlisted extensions | `agent/src/fsguard.ts` |
| Remote server control | Outbound-only agent, localhost-only RCON, revocable hashed credentials, typed operations, local allowlist + denylist enforced independently of the cloud, no shell, no restarts, backups before writes, every operation audited | ServerOS + agent |
| Secrets | Wrangler secrets / `.dev.vars` (git-ignored); nothing secret in client bundles; agent config written `0600`; CI secret scan | `.gitignore`, `ci.yml` |
| Headers | CSP (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri`/`form-action 'self'`), HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP | `src/lib/security/headers.ts` |
| Audit | Append-only `audit_events` for account, server, credential, command, deployment, module, flag and report actions | `src/lib/audit.ts` |
| Privacy | Profile visibility and section toggles enforced server-side for all viewers; blocks hide profiles and search results both ways; plugin config contents pruned after 1 hour; production email bodies not stored | NexusID, `sweep.ts`, `email.ts` |

## Known gaps / upgrade paths

- **CSP `'unsafe-inline'` for scripts** — required by App Router inline RSC scripts without
  nonces. Upgrade: per-request nonces via middleware once the adapter supports it, or hashes.
- **PBKDF2 at 100k** is below OWASP's 600k recommendation for PBKDF2-SHA256 because Workers caps
  iterations at 100k. Upgrade path: Argon2id in a dedicated (paid) Worker; existing hashes are
  rehashed on next login thanks to the versioned format.
- **No MFA yet.** TOTP/WebAuthn are planned.
- **Agent token in a file.** Protect the host; rotate on suspicion. Credential use is visible
  under *Access* (last used).
- **Rate limits in D1** are per-colo-consistent but not a DDoS defence; put the app behind
  Cloudflare WAF rate-limiting rules in production.
