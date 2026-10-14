# API reference

All endpoints return JSON `{ "data": … }` on success or
`{ "error": { "code", "message", "details"? } }` with an HTTP status matching `code`:
`bad_request 400`, `unauthenticated 401`, `forbidden 403`, `not_found 404`, `conflict 409`,
`validation_failed 422`, `rate_limited 429` (with `Retry-After`), `module_disabled 503`,
`unavailable 503`, `internal 500`.

## Conventions

- **Browser API (`/api/v1`)** authenticates with the session cookie. Every non-GET request must
  carry an `Origin` (or `Referer`) matching the host, and JSON bodies must use
  `Content-Type: application/json`. Mutations are rate limited per user (120/min) plus stricter
  per-action limits (login, register, uploads, exports, server commands, reports).
- **Agent API (`/api/agent/v1`)** authenticates with `Authorization: Bearer sxa_…` and rejects any
  request carrying cookies or an `Origin` header. 60 requests/min per credential.
- Request bodies are validated with Zod; the source of truth for every shape is linked below.
- Module-scoped endpoints return `503 module_disabled` while their module is unavailable.

## Auth & account

| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/auth/register` | `{email, username, password, displayName?, turnstileToken?}` → always `verification_sent` (no account enumeration) |
| POST | `/api/v1/auth/verify-email` | `{token}` (explicit POST so link scanners can't consume tokens) |
| POST | `/api/v1/auth/verify-email/resend` | `{email}` |
| POST | `/api/v1/auth/login` | `{email, password}` → sets session cookie. Requires a verified email. |
| POST | `/api/v1/auth/logout` | Revokes the current session |
| POST | `/api/v1/auth/password/forgot` | `{email, turnstileToken?}` |
| POST | `/api/v1/auth/password/reset` | `{token, password}` → revokes all sessions |
| POST | `/api/v1/auth/password/change` | `{currentPassword, newPassword}` → revokes other sessions |
| GET/DELETE | `/api/v1/me/sessions` | List; DELETE signs out all other sessions |
| DELETE | `/api/v1/me/sessions/:id` | Revoke one of your sessions |
| GET/PATCH | `/api/v1/me/preferences` | `{theme, sidebarCollapsed, reducedMotion, defaultWorkspaceId}` |
| PATCH | `/api/v1/me/account` | `{displayName}` |
| GET/POST | `/api/v1/notifications` | `?countOnly=1`; POST `{ids: string[] \| "all"}` marks read |
| GET | `/api/v1/search?q=` | Access-filtered results across modules |
| GET | `/api/health` | Unauthenticated; version + D1 reachability |

Schemas: `src/lib/auth/service.ts`, `src/modules/studio/preferences.ts`.

## NexusID (`module: nexusid`)

| Method | Path | Notes |
|---|---|---|
| GET/PATCH | `/api/v1/nexus/profile` | `profileInput` in `src/modules/nexusid/profiles.ts` |
| GET/POST | `/api/v1/nexus/friends` | POST `{username}` sends (or accepts a reciprocal) request |
| POST/DELETE | `/api/v1/nexus/friends/:id` | POST `{action: accept\|decline}` (addressee only); DELETE removes/cancels |
| GET/POST | `/api/v1/nexus/blocks` · DELETE `/:userId` | Blocking removes friendships and hides profiles both ways |
| POST | `/api/v1/nexus/reports` | `{targetType: user\|team\|project, targetId, reason, details}` |
| PUT | `/api/v1/nexus/cosmetics/loadout` | `{category, cosmeticId \| null}` — ownership enforced |
| PUT | `/api/v1/nexus/achievements/showcase` | `{ids}` (max 6) |
| GET/POST | `/api/v1/nexus/teams` | Create `{name, description, visibility}` |
| DELETE | `/api/v1/nexus/teams/:id` | Owner only |
| POST | `/api/v1/nexus/teams/:id/members` | Invite `{username}` (owner only) |
| POST/DELETE | `/api/v1/nexus/teams/:id/members/:userId` | `me` + `{action}` to answer an invite; DELETE leaves or (owner) removes |
| GET | `/api/v1/nexus/minecraft/link` → `/callback` | Microsoft OAuth (PKCE); requires `MS_CLIENT_ID/SECRET` and the flag |
| DELETE | `/api/v1/nexus/minecraft` | Unlink |
| GET/PATCH | `/api/v1/admin/reports[/:id]` | `platform.reports.review` |

Public profiles are rendered at `/u/:username` (no JSON API).

## ForgeOS (`module: forgeos`)

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/api/v1/forge/projects` | `?workspaceId=&archived=1`; POST `projectInput` |
| GET/PATCH | `/api/v1/forge/projects/:id` | GET returns full content; PATCH metadata, `packDescription`, `archived` |
| POST | `/api/v1/forge/projects/:id/duplicate` | Copies content and asset files |
| POST | `/api/v1/forge/projects/:id/{items\|abilities\|sets}` | `itemInput` / `abilityInput` / `equipmentSetInput` |
| PUT/DELETE | `/api/v1/forge/projects/:id/{items\|abilities\|sets}/:entityId` | |
| POST | `/api/v1/forge/projects/:id/assets` | `multipart/form-data`: `kind=texture\|model`, `name`, `file`. PNG ≤256 KB square 16–512 px; model JSON ≤64 KB |
| GET/DELETE | `/api/v1/forge/projects/:id/assets/:assetId` | GET streams with a fixed content type and `default-src 'none'` CSP |
| GET | `/api/v1/forge/projects/:id/validate` | `ValidationReport` |
| GET/POST | `/api/v1/forge/projects/:id/exports` | POST `{format: datapack\|resourcepack\|bundle}` → `{status, revision, sha256, errors}` |
| GET | `/api/v1/forge/projects/:id/exports/:exportId` | ZIP download, `X-Sythix-Sha256` header |
| GET/POST | `/api/v1/forge/projects/:id/revisions` | POST `{message}` saves a revision (no-op if unchanged) |
| POST | `/api/v1/forge/projects/:id/revisions/:n` | Restore revision `n` (recorded as a new revision) |

Schemas: `src/modules/forgeos/schema.ts`.

## ServerOS (`module: serveros`)

| Method | Path | Required server permission |
|---|---|---|
| GET/POST | `/api/v1/servers` | POST needs workspace `server.register` + verified email |
| GET/PATCH/DELETE | `/api/v1/servers/:id` | view / manage / manage |
| GET | `/api/v1/servers/:id/telemetry?range=1h\|6h\|24h\|7d` | view |
| GET/POST | `/api/v1/servers/:id/console` | GET `?after=seq&level=` console.read · POST `{command}` console.execute |
| GET/POST | `/api/v1/servers/:id/players` | POST `{action: kick\|ban\|unban, player, reason}` players.moderate |
| GET/POST | `/api/v1/servers/:id/plugins` | POST rescans (plugins.read) |
| POST | `/api/v1/servers/:id/config` | `{action: read\|backups}` plugins.read · `{action: write\|restore}` plugins.manage |
| GET | `/api/v1/servers/:id/commands/:commandId` | requester or audit.read |
| GET/POST | `/api/v1/servers/:id/credentials` · DELETE `/:credentialId` | credentials.manage; POST `{label, revokeOthers}` returns the token once |
| GET/POST | `/api/v1/servers/:id/members` · DELETE `/:userId` | members.manage; target must be in the workspace |
| GET | `/api/v1/servers/:id/audit` | audit.read |

Operation-queueing endpoints return `{id}` of a command. Poll the command endpoint for the
agent's actual result; `503 unavailable` means nothing was sent (agent offline or capability
disabled). Payload rules: `src/modules/serveros/protocol.ts`.

## Deployments

| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/deployments` | `{projectId, exportId, serverId, reloadAfter}` → `{id, plan}`; nothing is sent yet |
| GET | `/api/v1/deployments/:id` | Plan, status, agent result |
| POST | `/api/v1/deployments/:id/confirm` | `{confirmText?}` — production requires the exact server name |
| POST | `/api/v1/deployments/:id/cancel` | Planned deployments only |

## Studio administration

| Method | Path | Permission |
|---|---|---|
| GET | `/api/v1/studio/modules` | any signed-in user |
| PATCH | `/api/v1/studio/modules/:id` | `platform.modules.manage`; `{enabled}` |
| POST | `/api/v1/studio/health` | `platform.modules.manage` |
| GET/PATCH | `/api/v1/studio/flags` | PATCH `platform.flags.manage`; `{key, enabled: boolean \| null}` |

## Agent API

| Method | Path | Notes |
|---|---|---|
| POST | `/api/agent/v1/heartbeat` | `heartbeatSchema` in `protocol.ts` → `{serverId, heartbeatIntervalMs, commands[]}` |
| GET | `/api/agent/v1/deployments/:id/artifact` | Only for a *dispatched* deployment targeting the caller's server |
