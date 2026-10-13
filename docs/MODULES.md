# Module system

SythiX is extended through **first-party modules**: TypeScript code that ships in this repository,
is reviewed like any other change, and is explicitly registered. Nothing is downloaded, uploaded or
evaluated at runtime.

## Anatomy of a module

```ts
// src/modules/<id>/manifest.ts
export const exampleModule = defineModule({
  id: "maps",                      // lowercase kebab-case, unique
  name: "MapOS",
  description: "World and map management.",
  version: "0.1.0",                // semver of the module
  icon: "puzzle",
  nav: [{ href: "/maps", label: "MapOS", icon: "puzzle" }],
  permissions: ["maps.view", "maps.edit"],
  dependencies: { studio: "^0.1.0", serveros: "^0.1.0" },
  platform: ">=0.1.0 <1.0.0",      // supported SythiX platform versions
  migrations: ["0007_maps.sql"],   // must be applied for the module to be available
  featureFlags: [{ key: "maps.beta-editor", description: "…", defaultEnabled: false }],
  async healthCheck(ctx) { return { status: "healthy", detail: "…" }; },
});
```

## Adding a module

1. **Schema** — add the next numbered migration in `migrations/`. Never edit an applied migration.
2. **Services** — `src/modules/<id>/*.ts`. Every function takes `AppContext` and performs its own
   authorization (`requireWorkspace`, `requireServer`, `requirePlatform`).
3. **Permissions** — if the module needs new permissions, add them to `src/lib/authz/roles.ts`
   **and** seed them in the migration (`role_permissions`). `tests/authz.test.ts` keeps them in sync.
4. **Routes** — pages under `src/app/(studio)/<path>` with a `layout.tsx` that calls
   `isModuleAvailable(ctx, "<id>")` and `notFound()` otherwise; API routes under
   `src/app/api/v1/<id>/…` using `route({ module: "<id>" }, …)`.
5. **Register** — add the manifest to `MODULES` in `src/modules/index.ts`.
6. **Search** (optional) — add a source to `src/modules/ecosystem/search.ts`, filtered by access.
7. **Tests** — at minimum authorization and the module's critical paths. `tests/modules.test.ts`
   validates the whole registry (ids, semver, dependency ranges, cycles, platform compatibility,
   navigation collisions, flag namespacing).
8. **Docs** — update `docs/STATUS.md` and `CHANGELOG.md`.

## Runtime behaviour

- On first request after deployment, new manifests are inserted into `module_registrations`
  (audited as `module.installed`); higher versions are recorded as `module.upgraded`.
- A module is **available** when it is enabled, its dependencies are available, its platform range
  matches, and its migrations appear in `d1_migrations`. Otherwise it is hidden from navigation and
  the reasons are shown on **Studio → Modules**.
- Core modules cannot be disabled; a module cannot be disabled while an enabled module depends on
  it, nor enabled while its dependencies are disabled.
- Health checks run per module with a 5-second timeout and isolation; one failing module never
  affects the others. Pages render inside per-segment error boundaries.

## Third-party modules (future)

The extension points are deliberately limited to reviewed code. A future third-party model would
need: signed packages reviewed out-of-band, declarative manifests only (no server-side code in the
Worker), capability-scoped APIs and sandboxed execution (e.g. a separate Worker per extension with
service bindings). None of that is enabled, and uploaded code is never executed.
