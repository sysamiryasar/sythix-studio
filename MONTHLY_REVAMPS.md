# Monthly revamps

SythiX Unite ships a predictable monthly release, called **Monthly Evolution**. Each one should add real value without redesigning every screen or breaking user data.

## Monthly checklist

1. **Review.** Go through feedback, bug reports, the moderation queue and the past month's error logs.
2. **Choose scope.** Pick a realistic set: at least one meaningful feature and one UI/UX improvement. Write acceptance criteria before starting.
3. **Build behind flags** if a feature is risky or incomplete.
4. **Security and accessibility pass.** Review new routes for server-side authorization, check keyboard and screen-reader paths on changed screens, and keep contrast ≥ 4.5:1.
5. **Regression testing.** `pnpm check` (lint, typecheck, unit/integration tests, build) plus `pnpm test:e2e` against a fresh `wrangler dev`.
6. **Cost review.** Re-verify [FREE_TIER_AUDIT.md](FREE_TIER_AUDIT.md) against official pricing pages and compare actual usage in the Cloudflare dashboard.
7. **Documentation.** Update `CHANGELOG.md`, the in-app changelog (`src/shared/changelog.ts`), `docs/STATUS.md` and the affected docs.
8. **Preview.** Deploy a preview version (`wrangler versions upload`), which doesn't shift traffic.
9. **Release** only when the acceptance criteria pass. Production deploys need the owner's approval.
10. **Rollback plan.** Note the previous version ID (`wrangler deployments list`). Migrations must be additive so rolling back the Worker never breaks the database.

## Compatibility rules

- **Database:** never edit an applied migration; add a new `migrations/NNNN_*.sql`. Migrations are additive within a release; drop a column only one release after the code stops using it.
- **Design tokens:** tokens live in `src/client/styles.css` and are versioned (`--sx-tokens-version`). A token rename keeps the old name as an alias for one release.
- **API:** add fields freely. Removing or renaming a field requires one release of deprecation.
- **Destructive changes** (data deletion, migration rewrites, bulk updates) are never deployed automatically.

## Roadmap by month (subject to review)

| Month | Release | Focus | UI/UX improvement |
|---|---|---|---|
| 2026-10 | **0.1.0** | Foundation: SythiX ID, Unite shell, Social, Connect (text + realtime), moderation. | Design system v1, Everything Command. |
| 2026-11 | 0.2.0 | Minecraft Database M4: player profiles (Mojang UUID lookup), server directory, live Java status checks with last-checked timestamps, community links. | Profile pages gain linked identities. |
| 2026-12 | 0.3.0 | Voice/video M5 (only once an SFU is approved): diagnostics, call UI, screen sharing. Otherwise, threads and forums. | Chat threads; message attachments. |
| 2027-01 | 0.4.0 | SythiX Studio M6: dashboard widgets, theme presets, developer docs, webhooks. | ConnectOS custom layouts. |
| 2027-02 | 0.5.0 | Hosting M7: provider adapter and a local provisioning prototype (public hosting stays off). | Server console UI. |
| 2027-03 | 0.6.0 | SythiX AI M8: provider abstraction, permission-aware retrieval, explicit approval for actions. | Assistant panel. |

## Previous revamps

| Release | Date | Delivered | Skipped / moved |
|---|---|---|---|
| 0.1.0 | 2026-10-17 | See CHANGELOG.md. | Voice/video (no media server), forums/threads, passkeys/MFA. |
