---
source: tests/support/contract-routes.ts
sha256: c6a90215e66c8058297dc883ebbf0ca5085e637c8d82c9e468e994175de27cfd
generated_at: 2026-10-15T12:56:57.457867+00:00
model: ollama:qwen3.8:27b
---

# tests/support/contract-routes.ts

## Purpose

Produces a flat, contract-level inventory of every endpoint mounted by any enabled module (method, absolute path, guard chain, permission key). It lives in its own file rather than in `@tests/routes` because importing `enabledModules` drags in every module's event subscriptions and demo seeding — a cost per-module route unit tests have no reason to pay.

## Key elements

- **`MountedRoute`** (interface) — one row per endpoint: `method`, absolute `path`, ordered `guards` array, optional `permissionKey`, and optional `exactPermission` flag.
- **`everyMountedRoute()`** (exported function) — filters `enabledModules` down to those with `basePath` + `routes`, then calls `effectiveRouteTable` on each module's router and maps the result into `MountedRoute[]`, prepending the module's `basePath` to produce the absolute path.

## Relationships

- **`src/modules.ts`** — provides `enabledModules`, the list of active modules from which `basePath` and `routes` are read.
- **`tests/support/routes.ts`** — provides `effectiveRouteTable`, which extracts method/path/guard metadata from a single flat Express router.
- **`tests/contract/authorization-contract.test.ts`** — consumes `everyMountedRoute` to assert permission-guard coverage across all endpoints.
- **`tests/cross-cutting/api-key-security.test.ts`** — consumes `everyMountedRoute` to verify API-key guard placement across all endpoints.

## Notes

- Walks each module's router individually instead of the assembled `app` because `app.use(basePath, router)` nests a module as one opaque middleware layer; `effectiveRouteTable` only reads a flat router's own routes.
- The `guards` array is the concatenation of `applies` (router-level middleware) followed by `chain` (per-route guards), in actual execution order.
- `permissionKey` / `exactPermission` are `undefined` for routes that have no `requirePermission` guard.
