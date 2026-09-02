# tests/support/contract-routes.ts

## Purpose

Provides the contract-test layer's flat view of every endpoint mounted across the app (method, absolute path, effective guard chain). It exists as a separate module from `tests/support/routes.ts` so that contract tests can enumerate routes without paying the cost of `enabledModules` pulling in event subscriptions and demo seeding that per-module route unit tests don't need.

## Key elements

- **`MountedRoute`** (interface) — one row per endpoint: `method` (uppercase), `path` (absolute: module `basePath` + router path), `guards` (router-level then per-route, in execution order).
- **`everyMountedRoute()`** — iterates `enabledModules`, filters to modules that expose both `basePath` and `routes`, calls `effectiveRouteTable` on each module's own `Router`, and maps the result into `MountedRoute[]` with the base path prepended and `applies` + `chain` concatenated into `guards`.

## Relationships

- **`src/modules.ts`** — source of `enabledModules`; the list of active modules whose routers are walked.
- **`tests/support/routes.ts`** — source of `effectiveRouteTable`, the utility that extracts method/path/guard info from a flat Express `Router`.
- **`tests/contract/authorization-contract.test.ts`** — primary consumer; calls `everyMountedRoute()` to assert that authorization guards are present on every endpoint.

## Notes

- Walks each module's router individually rather than the assembled `app`. Because `app.use(basePath, router)` nests a module as a single opaque middleware layer, `effectiveRouteTable` cannot see into it; this is the same reason `routes.test.ts` walks modules one at a time.
- The guard array order is **router-level first** (`applies`), **per-route second** (`chain`), matching actual Express execution order.
- `path` is always absolute (e.g. `/inventory/:id`); relative router paths are never returned.
- Modules lacking either `basePath` or `routes` are silently skipped by the type-guard filter.
