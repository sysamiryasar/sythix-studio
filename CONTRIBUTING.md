# Contributing

## Setup

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm db:migrate:local && pnpm db:seed:local
pnpm dev
```

Before opening a PR run `pnpm check` (lint, typecheck for app + agent, tests). For changes that
touch routing, bindings or the Worker entry also run `pnpm cf:preview` and click through the
affected pages: the OpenNext/workerd runtime differs from `next dev`.

## Conventions

- **TypeScript strict**, `noUncheckedIndexedAccess`. No `any` without a reason in a comment.
- **Services own authorization.** Routes stay thin; never rely on the UI to hide something.
- **SQL** only through `one/all/run/stmt` with bound parameters.
- **New schema** = a new numbered migration; never edit an applied one. Keep migrations additive
  where possible so Worker rollbacks stay safe.
- **Honesty in the UI**: label sample, placeholder, stale and unavailable data; never report an
  operation as successful before the agent confirms it; mark runtime-only features as such.
- **Tests**: authorization and critical paths need tests. Tests run real migrations on
  `node:sqlite` via `tests/helpers/d1.ts`; use `createTestApp()` / `createUser()`.
- **Components**: reuse `src/components/ui/*`; colours only through design tokens; client
  components that render relative times use `<RelativeTime>`.
- **Commits/PRs**: describe *why*; update `CHANGELOG.md` (`[Unreleased]`) and `docs/STATUS.md`
  when capabilities change.

## Adding a module

Follow [docs/MODULES.md](docs/MODULES.md).
