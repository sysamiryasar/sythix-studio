# SythiX Studio

**The all-in-one Minecraft center.** One account and one application for player identity, server
operations and content creation, built as a modular platform on Cloudflare.

| Module | What it does today |
|---|---|
| **NexusID** | Accounts, profiles with server-enforced privacy, friends, blocks, reports, teams, event-driven achievements, a cosmetic inventory (placeholder art, website-only), Minecraft Java account linking via Microsoft sign-in (requires an approved Azure app). |
| **ForgeOS** | Projects with folders and revisions; an item editor (attributes, enchantments, durability, lore, food, recipes, textures, JSON models); ability and equipment-set authoring; byte-level asset validation; version-aware **datapack** and **resource pack** export for Java 1.20.6 / 1.21.1 / 1.21.4 / 1.21.5; a three.js viewport. |
| **ServerOS** | Paper/Purpur server registration, a zero-dependency outbound **server agent**, live status and telemetry, console with authorized commands, kick/ban/unban, plugin inventory, sandboxed config editing with backups and restore, audit logs, per-server roles. |
| **Studio** | Application shell, workspaces, scoped RBAC, global search and command palette, notifications, a module registry with health checks and feature flags, an updates page, and the ForgeOS → ServerOS deployment workflow. |

What is implemented, what needs a plugin that doesn't exist yet, and what is planned is tracked
honestly in **[docs/STATUS.md](docs/STATUS.md)**.

## Stack

Next.js 15.5 (App Router, React 19, TypeScript strict) · Tailwind CSS 4 · Cloudflare Workers via
`@opennextjs/cloudflare` · D1 · R2 · Cron Triggers · Turnstile · Zod · three.js · Vitest.

Why Next 15.5 and not 16: Next 16.x builds with the current OpenNext adapter but failed at runtime
inside `workerd` during verification; 15.5.27 is inside OpenNext's supported range and passes the
same end-to-end checks. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#runtime-decisions).

## Quick start (local)

Requirements: Node.js ≥ 22.12, pnpm 10.

```bash
pnpm install
cp .dev.vars.example .dev.vars          # Turnstile test keys, optional providers
pnpm db:migrate:local                   # apply D1 migrations to the local database
pnpm db:seed:local                      # optional demo data (owner@example.com / builder@example.com)
pnpm dev                                # http://localhost:3000
```

Without an email provider, verification and reset emails are shown at
<http://localhost:3000/dev/outbox> (development only). The seed prints the demo password.

To run the real Workers runtime locally (recommended before every release):

```bash
pnpm cf:preview                         # OpenNext build + wrangler dev on workerd
```

### Try ServerOS without a Minecraft server

Register a server, copy the credential, then start the agent in **simulated** mode. Everything it
reports is labelled “Sample environment” in the UI and never counts as a real connection.

```bash
pnpm agent:build
node agent/dist/agent.js init --api-url http://localhost:3000 --token <sxa_...> --simulated
node agent/dist/agent.js run --config sythix-agent.json
```

For a real Paper/Purpur server see [docs/AGENT.md](docs/AGENT.md).

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Next.js dev server with local D1/R2 bindings |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | ESLint, `tsc` (app + agent), Vitest |
| `pnpm check` | All three |
| `pnpm cf:build` / `cf:preview` / `cf:upload` / `cf:deploy` | OpenNext build, local workerd preview, upload a version, deploy |
| `pnpm db:migrate:local\|staging\|production` | Apply D1 migrations |
| `pnpm db:seed:local` | Generate and load demo data (local only) |
| `pnpm agent:build` | Build the server agent to `agent/dist` |

## Repository layout

```
migrations/            D1 schema (numbered, append-only)
src/app/               Routes: (auth), (studio) pages, api/v1 (browser), api/agent/v1 (agents)
src/lib/               Context, auth, RBAC, security, HTTP wrappers, audit, notifications
src/modules/           Module registry + studio, nexusid, forgeos, serveros, ecosystem services
src/components/        UI primitives, shell, per-module components
agent/                 @sythix/server-agent (Node, zero dependencies)
worker.ts              Worker entry: OpenNext fetch + cron maintenance
tests/, agent/test/    Vitest suites (real migrations on node:sqlite)
docs/                  Architecture, API, deployment, security, releasing, status
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md) · [Module system](docs/MODULES.md) · [API](docs/API.md)
- [Deployment & environment variables](docs/DEPLOYMENT.md) · [Releasing, rollback, backups](docs/RELEASING.md)
- [Server agent](docs/AGENT.md) · [Minecraft account linking](docs/MINECRAFT-LINKING.md)
- [Security architecture](docs/SECURITY-ARCHITECTURE.md) · [Security policy](SECURITY.md)
- [Status: implemented vs planned](docs/STATUS.md) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

SythiX Studio is not affiliated with Mojang Studios or Microsoft. Minecraft is a trademark of Mojang Synergies AB.
