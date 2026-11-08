---
source: tests/support/contract-routes.ts
sha256: 1833d116dcc38611ca3bb34a7ec0a7fef9ac815517bf68f6d97d918b16c269a9
generated_at: 2026-11-08T09:53:13.232473+00:00
model: ollama:qwen3.8:27b
---

# tests/support/contract-routes.ts

## Purpose

Provides a flat, contract-level inventory of every endpoint mounted by all enabled modules — method, absolute path, guard chain, and permission asks. It exists as a separate support module so that contract and cross-cutting tests can enumerate the full route surface without paying the cost of module event subscriptions and demo seeding that `@tests/routes` pulls in via `enabledModules`.

## Key elements

- **`MountedRoute`** (interface) — Describes one mounted endpoint: uppercase HTTP `method`, absolute `path` (module `basePath` + router path), `guards` (router-level + per-route, in execution order), and `permissions` (what `requirePermission` guards ask).
- **`everyMountedRoute()`** (exported function) — Walks each enabled module's `mounts` array, calls `effectiveRouteTable` on each module's own `routes` router, and flattens the result into `MountedRoute[]`. Prepends `basePath` to produce absolute paths and merges `applies` + `chain` into the `guards` list.

## Relationships

- **`src/modules.ts`** — Source of `enabledModules`; this file reads each module's `mounts` (with `basePath` and `routes`) to build the flat table.
- **`tests/support/routes.ts`** — Source of `effectiveRouteTable` (resolves a single flat router's routes into method/path/applies/chain/permissions) and the `PermissionAsk` type. This file deliberately re-exports the *data* without importing the full app-assembly machinery that module lives alongside.
- **`tests/contract/authorization-contract.test.ts`**, **`tests/contract/ownership-contract.test.ts`**, **`tests/cross-cutting/api-key-security.test.ts`**, **`tests/cross-cutting/identity-guards-follow-the-spec.test.ts`** — Downstream consumers that call `everyMountedRoute()` to assert guard/permission coverage across the entire API surface.

## Notes

- The function walks each module's **own router** rather than the assembled `app`. Because `app.use(basePath, router)` nests a module as an opaque middleware layer, `effectiveRouteTable` (which reads a flat router's `.routes`) cannot see inside it. This is the same reason `routes.test.ts` walks modules individually.
- `guards` is the concatenation of `applies` (router-level middleware) and `chain` (per-route middleware), preserving the order in which they actually execute.
- `permissions` is empty for routes that carry no `requirePermission` guard.
- Kept in `tests/support/` (not `@tests/routes`) specifically to avoid the event-subscription and demo-seeding side effects of importing the full module registry for tests that only need the route table.
