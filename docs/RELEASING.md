# Releasing, rollback, backup and restore

## Versioning

- The platform follows **SemVer** (`package.json` `version`). Each module has its own semver in its
  manifest; a module's `platform` range declares the platform versions it supports.
- Every user-visible change gets a `CHANGELOG.md` entry under `[Unreleased]`.
- Database changes are **new numbered migrations** only. Applied migrations are never edited.
  Prefer additive, backwards-compatible changes (add columns/tables, backfill, switch reads, then
  remove in a later release) so a Worker rollback still works against the newer schema.

## Cutting a release

1. Move `[Unreleased]` entries to `## [X.Y.Z] - YYYY-MM-DD` in `CHANGELOG.md`; bump `package.json`
   (and module versions that changed).
2. Open a PR; CI must pass; get review.
3. After merge: `git tag vX.Y.Z && git push origin vX.Y.Z`.
4. `release.yml` verifies the tag matches `package.json`, checks the changelog entry, runs
   lint/typecheck/tests, migrates and deploys **staging**, then waits for a required reviewer on
   the `production` environment.
5. On approval it records a **D1 Time Travel bookmark** (uploaded as a workflow artifact), applies
   production migrations, deploys, and publishes the GitHub release.
6. Smoke test: `/api/health`, sign-in, Studio → Updates shows the new version and migrations,
   Studio → Modules → *Run health checks*.

No automated process — including AI assistants — deploys to production or runs production
migrations outside this workflow.

## Rollback

**Worker code** (fast, no data change):

```bash
pnpm exec wrangler deployments list --env production
pnpm exec wrangler rollback <version-id> --env production
```

Rolling back code is safe when the release's migrations were additive (see above).

**Database** (only for a bad migration or data corruption — this discards writes after the point):

```bash
# The bookmark printed by the release job (artifact: d1-bookmark-vX.Y.Z)
pnpm exec wrangler d1 time-travel restore sythix-db --env production --bookmark <bookmark>
# or to a timestamp
pnpm exec wrangler d1 time-travel restore sythix-db --env production --timestamp <unix-seconds>
```

Then roll the Worker back to the matching version. Announce the data-loss window to users.

## Backups

| Data | Mechanism | Retention |
|---|---|---|
| D1 | Time Travel (point-in-time restore) — automatic | 30 days on Workers Paid, 7 days on Free (check current limits) |
| D1 (long-term) | `wrangler d1 export sythix-db --env production --remote --output backup-YYYYMMDD.sql` on a schedule, stored outside Cloudflare | your policy |
| R2 (assets, exports) | Enable bucket object versioning or periodic `rclone sync` to a second bucket/provider | your policy |
| Server configs | The agent backs up every plugin config before writing (`.sythix-backups/<timestamp>/` on the host) and before every datapack replacement | until removed on the host |

### Restore test (do this before relying on it)

```bash
pnpm exec wrangler d1 export sythix-db --env staging --remote --output /tmp/staging.sql
pnpm exec wrangler d1 create sythix-restore-test
pnpm exec wrangler d1 execute sythix-restore-test --remote --file /tmp/staging.sql
pnpm exec wrangler d1 execute sythix-restore-test --remote --command "SELECT COUNT(*) FROM users"
pnpm exec wrangler d1 delete sythix-restore-test
```

A local equivalent is exercised by CI: every PR applies all migrations to a fresh database, and the
test suite runs the real migrations on an in-memory SQLite.

## Hotfixes

Branch from the release tag, fix, bump the patch version, update the changelog, tag. The same
workflow and approval gate apply.
