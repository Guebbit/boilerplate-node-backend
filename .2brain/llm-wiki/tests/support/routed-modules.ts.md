---
source: tests/support/routed-modules.ts
sha256: f23e8b9a47f4265c537e8aa5426c7944bdab6bbcad346527573e39e3305dacfe
generated_at: 2026-10-29T07:10:37.074526+00:00
model: ollama:qwen3.8:27b
---

# tests/support/routed-modules.ts

## Purpose

Provides a test-accessible map of every enabled module's Express router(s), derived at runtime from the production registry in `src/modules.ts` rather than hard-coded. This guarantees a newly enabled module is automatically covered by cross-cutting route tests without any test-side update.

## Key elements

- **`ROUTED_MODULES`** (`Record<string, Router>`) — All routed modules keyed by directory name under `src/modules/`. Sub-routers a module mounts under another resource's URL appear under a `moduleName@subPath` key.
- **`routersOfModule(name: string): Router[]`** — Returns every router belonging to one module (its own plus any mounted sub-routers) by filtering `ROUTED_MODULES` keys on the prefix before the first `@`. Returns an empty array for a module with no routers.

## Relationships

- **`src/modules.ts`** — Imports `enabledModules`; the sole source of truth for which modules are active.
- **`tests/support/routes.ts`** — Imports the pure helper `routedModulesOf` (no middleware side-effects). Deliberately kept in a *separate* file so that `jest.requireActual('@tests/routes')` inside mock factories never pulls in real `rate-limit`/`cache`/`upload`/`route-flag` middlewares while that module is still mid-evaluation.
- **`tests/cross-cutting/account-protection-routes.test.ts`**, **`tests/cross-cutting/authenticated-controllers.test.ts`**, **`tests/cross-cutting/write-routes-are-guarded.test.ts`** — Consume `ROUTED_MODULES` / `routersOfModule` to assert route-level properties across all enabled modules.

## Notes

- The `@` character in a key is the separator for sub-routers (e.g. `billing@webhooks`). `routersOfModule` splits on the *first* `@` only.
- A consuming test file must still declare its own `jest.mock` calls for the middleware factories **before** importing this file — the same constraint as importing any router directly (see `@tests/routes` header for the `requireActual` timing rationale).
- A module folder that exists on disk but is *not* in the registry is intentionally **not** listed here; that gap is caught by `write-routes-are-guarded.test.ts` so an unguarded router can't slip through silently.
