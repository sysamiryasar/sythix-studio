# Changelog

All notable changes to SythiX Studio are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-10-13

### Added
- **Foundation**: Next.js 15.5 on Cloudflare Workers (OpenNext) with a custom Worker entry and
  cron; D1 schema (6 migrations); accounts with email verification, password reset and session
  management; scoped platform/workspace/server RBAC; rate limiting, Turnstile, CSRF origin
  checks and security headers; module registry with health checks and feature flags; application
  shell, command palette, global search, notifications and preferences.
- **NexusID**: profiles with server-enforced privacy, public profile pages, friends, blocks,
  reports and review queue, teams, event-driven achievements, placeholder cosmetics with loadouts,
  Minecraft Java linking via Microsoft sign-in (requires configuration).
- **ForgeOS**: projects, revisions, items, abilities, equipment sets, texture/model assets with
  byte-level validation, version-aware datapack and resource pack export for Java 1.20.6–1.21.5,
  deterministic verified archives, three.js preview.
- **ServerOS**: server registration, agent credentials, the `@sythix/server-agent` package
  (live and simulated modes), telemetry, console, moderation, plugin inventory, sandboxed config
  editing with backups, audit, disconnect notifications.
- **Ecosystem**: ForgeOS → ServerOS deployment workflow with compatibility checks and typed
  production confirmation; Studio home; module manager; updates page.
- CI and a gated, tag-driven release workflow; documentation.
