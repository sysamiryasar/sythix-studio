# Architecture

## Overview

```
                ┌────────────────────────── Cloudflare ──────────────────────────┐
 Browser ──────▶│ Worker (worker.ts)                                              │
  (cookie       │  ├─ fetch → OpenNext → Next.js App Router                       │
   session)     │  │    ├─ Server Components (pages)  ─┐                          │
                │  │    ├─ /api/v1/*  (route())       ─┼─▶ services (src/modules) │──▶ D1 (relational)
                │  │    └─ /api/agent/v1/* (agentRoute)┘          │               │──▶ R2 (assets, exports)
                │  └─ scheduled (cron, every minute) → sweep + retention          │
                └─────────────────────────────────▲───────────────────────────────┘
                                                  │ outbound HTTPS, bearer credential
 Minecraft host ── Paper/Purpur ◀─RCON(localhost)─ @sythix/server-agent ── files (plugins/, world/datapacks)
```

One Worker serves the UI, the browser API and the agent API. There is no separate backend:
Server Components and route handlers call the same typed service functions.

## Layers

| Layer | Location | Rule |
|---|---|---|
| Routes | `src/app/**` | Thin. Pages call services directly; API routes wrap services in `route()` / `agentRoute()`. |
| HTTP wrappers | `src/lib/http/api.ts`, `agent.ts` | Context, module gating, CSRF origin check, session or agent auth, rate limits, uniform JSON errors. |
| Services | `src/modules/*`, `src/lib/auth`, `src/lib/notifications.ts` … | Take an `AppContext`; perform **all** authorization; never trust callers. |
| Data | D1 via `src/lib/db/sql.ts` | Parameterised SQL only. Migrations in `migrations/`. |
| Blobs | R2 | Server-generated keys (`projects/<id>/<kind>/<assetId>`, `exports/<ws>/<project>/<id>.zip`). |

`AppContext` (`src/lib/context.ts`) carries `db`, `bucket`, `env`, `now()`, request IP/UA and
`waitUntil`. Tests inject an in-memory implementation; production obtains bindings from
`getCloudflareContext()`.

## Identity, tenancy and authorization

- **Accounts**: email + password (PBKDF2-SHA256 via WebCrypto, 100k iterations — the Workers
  maximum — in a versioned hash format). Login requires a verified email.
- **Sessions**: 256-bit random tokens; only SHA-256 hashes are stored. HttpOnly, SameSite=Lax,
  `__Host-` prefixed and Secure outside development. 30-day sliding expiry; per-session revocation.
- **Workspaces** own projects and servers. Every account gets a personal workspace.
- **RBAC** (`src/lib/authz/roles.ts`) has three independent scopes:
  - *platform*: `platform_owner`, `platform_admin`, `member`
  - *workspace*: `workspace_owner`, `workspace_admin`, `developer`, `creator`, `workspace_member`
  - *server*: `server_admin`, `server_moderator`, `server_viewer` — granted **per server**
  
  A workspace role never implies a server role. Deploying a ForgeOS export needs *both*
  `project.deploy.request` (workspace) and `server.deploy` (server). The same matrix is seeded into
  D1 (`roles`, `role_permissions`); a test fails if code and database drift.
- Non-members receive **404 rather than 403** for workspaces, projects and servers, so existence
  is not leaked.

## Modules

See [MODULES.md](MODULES.md). Modules are compiled-in manifests registered in
`src/modules/index.ts`. The runtime state (enabled flag, installed version, health) lives in
`module_registrations`; availability also requires satisfied dependencies, a compatible platform
version and applied migrations (read from `d1_migrations`). Disabled modules disappear from
navigation and their routes return 404 (pages) or `503 module_disabled` (API).

## ServerOS agent protocol

1. An admin registers a server and issues a credential `sxa_<prefix>_<secret>` (shown once).
2. The agent `POST /api/agent/v1/heartbeat` every ~10s with status, telemetry, console lines, the
   ban list (when changed) and results of previous operations.
3. The response carries queued **typed operations** (`console.command`, `players.kick|ban|unban`,
   `plugins.scan`, `config.read|write|backups|restore`, `datapack.deploy`). There is no generic
   shell or arbitrary file access.
4. The cloud refuses to queue anything for a disconnected server or for a capability the agent did
   not advertise; the agent re-validates every operation against its **own** local allowlist,
   path sandbox and console denylist, so a compromised cloud still cannot exceed local policy.
5. Results update the command row; side effects (plugin inventory, deployment status,
   notifications, achievements) are applied server-side. Results for other servers' commands are
   ignored.

A server is *online* if a heartbeat arrived within 45 seconds. A cron trigger notifies admins
once per outage and applies data retention. Real-time updates use short polling (console 2s);
see [STATUS.md](STATUS.md) for the Durable Objects upgrade path.

## ForgeOS export pipeline

`content → validate → generate → verify → zip → store`

- `versions.ts` encodes per-version formats (pack formats, singular vs plural data folders,
  `generic.` attribute prefixes, modifier ids vs name/UUID, ingredient encoding, enchantment and
  attribute-modifier component shapes, JSON-string vs inline text components, `item_model` +
  `assets/<ns>/items` vs `custom_model_data` overrides, `consumable` split).
- The **datapack** gives items through loot tables (`loot give @s loot ns:items/<id>`), which keeps
  text components as JSON objects across versions, plus shaped recipes with version-correct
  result components.
- The **resource pack** derives model ids from the same content, so packs exported separately
  still agree.
- Abilities, on-hit effects and set bonuses cannot be expressed in vanilla data and are exported
  only to `sythix-runtime.json`, explicitly labelled for a *planned* runtime plugin.
- After generation every JSON file is re-parsed and references (models → textures, item
  definitions → models, overrides → models, functions → loot tables, pack formats) are checked.
  Archives are deterministic (sorted entries, fixed timestamps) and include a SHA-256 manifest.
- Exports pin a project **revision**; an export creates one automatically when content changed.

## Deployment workflow

`plan → review → confirm (typed for production) → dispatch → agent verifies hash → install with backup → optional /minecraft:reload → result`.
Checks are evaluated when the plan is created **and again** at confirmation. Plans expire after
30 minutes. The server is never restarted. Implemented in `src/modules/ecosystem/deployments.ts`.

## Runtime decisions

| Decision | Why |
|---|---|
| Next.js **15.5.27** | 16.4.0 failed in workerd (`preview-props.json` manifest) and 16.3.8 failed with a dynamic `require("fs")` in Next's dev logger. 15.5.27 is in OpenNext 1.20's supported range and passes the end-to-end checks. Revisit when OpenNext declares support for newer 16.x. |
| TypeScript 5.9 | TypeScript 7 (native) is not yet relied upon by Next's type checking. |
| PBKDF2 (WebCrypto) | Native in Workers, no WASM; the free plan's CPU limit rules out memory-hard JS hashing. Versioned format allows rehash-on-login to Argon2id later. |
| Polling instead of WebSockets | Works on any plan and in tests; console latency ≈2s. Durable Objects hub is the planned upgrade. |
| D1 rate-limit table | Portable, testable; can be swapped for the Workers Rate Limiting binding. |
| Synchronous exports | Typical exports are kilobytes and finish well inside one request. Queues are the planned path for large asset bundles. |
| CSP with `'unsafe-inline'` scripts | App Router emits inline RSC scripts; nonces need middleware. All other directives are locked down. |

## Data retention

| Data | Retention | Where |
|---|---|---|
| Telemetry minute buckets | 7 days | `pruneData` (cron) |
| Console lines | newest 2000 per server | cron |
| `config.read` results / `config.write` payloads (file contents) | 1 hour | cron |
| Server commands | 30 days | cron |
| Expired/revoked sessions | 30 days after expiry/revocation | cron |
| Read notifications | 90 days | cron |
| Audit events | kept (append-only) | — |
| Email bodies in `email_outbox` | not stored in production | `sendEmail` |
