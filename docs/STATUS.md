# Status: implemented, runtime-dependent, planned

Legend: ✅ implemented and tested · 🟡 implemented, needs external setup or a not-yet-built component · 📋 planned

## Acceptance criteria (first usable release)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Application builds | ✅ | `next build` and `opennextjs-cloudflare build` succeed; `wrangler deploy --dry-run` bundles `worker.ts` (CI steps) |
| 2 | Authentication works | ✅ | `tests/auth.test.ts` (16); manual HTTP run in `workerd`: register → verify → login → session-protected SSR |
| 3 | Protected routes enforce permissions | ✅ | `tests/authz.test.ts`, per-module authz tests in `nexusid`, `forgeos`, `serveros`, `ecosystem` suites; unauthenticated `/` redirects to `/login` (verified in workerd) |
| 4 | Migrations run correctly | ✅ | All 6 migrations apply to a fresh local D1 (CI step) and run in every test via `tests/helpers/d1.ts`; the Worker's runtime migrator is tested in `tests/setup.test.ts` and was verified in local workerd against an empty D1 |
| 5 | NexusID profiles can be created and updated | ✅ | Provisioned on registration; `tests/nexusid.test.ts` (11) |
| 6 | ForgeOS projects saved, validated, exported | ✅ | `tests/forgeos.test.ts` (17) incl. per-version output assertions and byte-determinism |
| 7 | ServerOS registers servers and reports connection status | ✅ | `tests/serveros.test.ts` (10); real agent process ↔ workerd over HTTP verified manually |
| 8 | Disconnected servers clearly identified | ✅ | `never_connected / online / offline` states, disconnect banner, operations refused while offline, cron notification once per outage (tested) |
| 9 | Supported integration securely receives authorized operations | ✅ | Agent: credential auth, capability gating, local allowlist/denylist, fs sandbox, RCON (`agent/test/agent.test.ts`, 9) and agent ↔ route handler end-to-end tests |
| 10 | ForgeOS exports connect to a deployment workflow | ✅ | `tests/ecosystem.test.ts`: plan → typed confirm → agent downloads, verifies hash, installs, reports |
| 11 | Module registry is extensible | ✅ | Registry validation + runtime gating tests (`tests/modules.test.ts`, 6); [MODULES.md](MODULES.md) |
| 12 | Useful success/error messages | ✅ | Uniform error JSON with field-level validation details; toasts; validation reports; deployment checks |
| 13 | Tests cover authorization, export and integration paths | ✅ | 87 tests across 10 suites |
| 14 | Reproducible Cloudflare deployment instructions | 🟡 | [DEPLOYMENT.md](DEPLOYMENT.md): dashboard import with default settings, or the release workflow. **Not yet executed against a real Cloudflare account** from this repository (no account credentials were available). D1/R2 auto-creation relies on Wrangler's resource provisioning |
| 15 | No production secrets committed | ✅ | Only Cloudflare's public Turnstile test keys in `.dev.vars.example`; `.dev.vars`, agent configs and seed SQL are git-ignored; CI secret scan |
| 16 | Docs separate implemented vs planned | ✅ | This file |

## By module

### Studio core
- ✅ Shell: collapsible sidebar, breadcrumbs, workspace switcher, notifications, user menu, mobile drawer, keyboard shortcuts (`Ctrl/⌘ K`, `Ctrl/⌘ B`, `g` + key, `?`)
- ✅ Command palette with global search (projects, items, assets, servers, players, teams, modules, settings), access-filtered
- ✅ Studio home with cross-module summary and pending tasks
- ✅ Preferences (theme dark/light/system, reduced motion, sidebar) persisted per account
- ✅ Module registry, health checks, enable/disable with dependency guards, feature flags
- ✅ Updates page (version, commit, migrations, module compatibility, changelog); 🟡 release check needs `RELEASES_REPO` and a public repo
- ✅ Audit log (personal, workspace, platform scopes); reports review queue
- 📋 Workspace management UI (create shared workspaces, invite members, change roles) — the data model and RBAC exist; only personal workspaces are created today
- 📋 MFA (TOTP/WebAuthn), account deletion/export

### NexusID
- ✅ Registration, verification, login, logout, per-session revocation, password reset/change
- ✅ Profiles: bio, banner, accent, avatar (initials or verified Minecraft head), visibility, section toggles, shareable `/u/:username`
- ✅ Friends, blocks, reports (+ admin review), teams (public/private, invitations, owner controls)
- ✅ Achievements awarded from real events; showcase
- ✅ Cosmetic inventory, loadout with ownership checks, unlocks via achievements
- 🟡 Cosmetic assets are **placeholders** rendered procedurally and labelled; they exist only on the website, never in vanilla Minecraft
- 🟡 Minecraft Java linking: full Microsoft → Xbox → XSTS → Minecraft chain implemented and tested with mocks; requires an approved Azure app ([MINECRAFT-LINKING.md](MINECRAFT-LINKING.md))
- 🟡 Email delivery requires `RESEND_API_KEY`. Otherwise development uses `/dev/outbox`, and in production the first account becomes the owner, who verifies later accounts in Studio → Users
- 📋 Creator follow/feeds, team-owned workspaces

### ForgeOS
- ✅ Projects with folders, description, namespace, target version, visibility; duplicate; archive/restore
- ✅ Revisions (auto on export, manual save), history and restore
- ✅ Item editor: base item, rarity, name colour, glint, unbreakable, durability, attributes (tooltip-aware conversion), slots/operations, enchantments, lore, food + consume effects, shaped recipes, textures, JSON models
- ✅ Validation per target version and per output, including what vanilla can and cannot express
- ✅ Datapack export (loot tables, give functions, recipes) and resource pack export (textures, models, item definitions or `custom_model_data` overrides) for Java **1.20.6, 1.21.1, 1.21.4, 1.21.5**; bundle with manifest and validation report; deterministic ZIPs; post-generation verification
- ✅ Asset upload with byte-level validation; 3D viewport (sprite extrusion; real model elements, UVs and rotations; orbit, zoom, lighting)
- 🟡 Abilities (10 templates) and equipment sets/bonuses/conditions are authored, validated and exported to `sythix-runtime.json` — **the SythiX Runtime plugin that would execute them does not exist yet**; they do nothing in-game today
- 📋 SythiX Runtime plugin (Paper), animated textures, block models, shapeless/smithing recipes, model editing (the viewer previews; it does not edit), Minecraft 1.21.2–1.21.3 and 1.21.6+ targets, Bedrock

### ServerOS
- ✅ Server registration, metadata, environment, removal; per-server roles; credentials (issue, rotate, revoke; hashed)
- ✅ Agent: outbound heartbeat, telemetry, console tail, players, bans, plugin inventory, config read/write/backups/restore, datapack deployment, simulated mode
- ✅ Dashboard with labelled metric sources (live / last known / unavailable / sample), charts with table views
- ✅ Console with command history, filters, denylist; moderation (kick/ban/unban, history); plugin compatibility warnings; audit
- ✅ Disconnect detection and notifications (cron)
- 🟡 TPS needs Paper/Purpur's `tps` command; JVM heap and server process uptime are not available over RCON (host metrics are reported and labelled as host)
- 🟡 Agent package is not yet published to npm; build from `agent/`
- 📋 Durable Objects WebSocket hub for sub-second console streaming; Paper plugin agent (JVM metrics, richer events); controlled plugin jar upload; scheduled backups; other server software

### Ecosystem
- ✅ ForgeOS → ServerOS deployment workflow with plan, checks, typed production confirmation, verified install, result tracking, notifications and achievement
- ✅ Public creations on NexusID creator profiles
- ✅ Shared notifications for disconnects, deployments, failed validation, friend/team events, security events, achievements
- 📋 Resource pack hosting for `server.properties` `resource-pack` URLs, Cloudflare Queues for large exports

### Production readiness
- ✅ CI (lint, typecheck, tests, audit, migrations, OpenNext build, Worker dry-run, agent build, secret scan), gated release workflow with D1 Time Travel bookmark
- ✅ Security headers, rate limiting, Turnstile, audit, retention jobs
- ✅ Accessibility: axe-core WCAG 2 A/AA scan of key pages; colour tokens adjusted to pass contrast; keyboard navigation, skip link, labelled controls, reduced motion
- 🟡 Error monitoring: structured JSON logs with Workers Observability enabled; no external error tracker configured
- 🟡 Known issue: under rapid sequential full-page navigations in a single tab against local `workerd`, React occasionally logs a recoverable hydration warning (#418). Server HTML and the client tree were captured and compared: they are structurally identical, and the page renders correctly. Not reproducible with fresh page loads (0/24) or under `next dev`. Tracked for re-testing on deployed Cloudflare infrastructure.
- 📋 Load/performance testing against real Cloudflare infrastructure; restore drill in a real account (procedure in [RELEASING.md](RELEASING.md))
