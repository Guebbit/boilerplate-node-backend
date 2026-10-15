---
source: src/modules/stats/tests/unit/routes.test.ts
sha256: 484eca36ec460be80f9b323bb0a6c8fbc499f0bcf2238f7db03a2fc89490ab66
generated_at: 2026-10-15T12:05:56.444068+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/tests/unit/routes.test.ts

## Purpose

Unit test that pins down the contract of the stats router: exactly eight read-only `GET` endpoints, every route requires an authenticated session, and every route is guarded by the single permission `stats.any.read`. It exists to catch accidental scope creep — a new public route, a missing auth guard, an inconsistent permission key, or a non-GET method — at test time rather than in production.

## Key elements

- **`jest.mock('@infrastructure/http/middlewares/rate-limit', …)`** — Replaces the rate-limit middleware with `securityMock()` (sourced from `@tests/routes` via `jest.requireActual`) so that tests exercise the router without real rate-limiting side effects.
- **`import { router } from '@modules/stats/routes'`** — The subject under test; the stats Express router.
- **`describe('stats routes')`** — Three assertions:
  - *Exact route list*: `routeSignatures(router)` must equal the eight documented `GET` paths (`/sales`, `/products`, `/products/:productId`, `/categories`, `/payments`, `/operations`, `/customers`, `/pipeline`).
  - *Session auth per route*: `it.each` iterates every signature and asserts `guardsOn(router, signature)` includes `'isAuth'`.
  - *Single permission key*: `routeTable(router)` maps every entry's `permissionKey` to `'stats.any.read'` (8 entries).
- **`routeSignatures`, `routeTable`, `guardsOn`** — Test-support helpers (imported from `@tests/routes`) that introspect an Express router to extract method+path signatures, the permission-key table, and the attached guard middleware names.

## Relationships

- **`src/modules/stats/routes.ts`** — The module under test. This file imports its `router` export and asserts on its route table, guards, and permissions.
- **`tests/support/routes.ts`** — Provides the introspection utilities (`routeSignatures`, `routeTable`, `guardsOn`) and the `securityMock` factory used to stub the rate-limit middleware. All helper imports and the mock's return value flow through this file (aliased as `@tests/routes`).

## Notes

- The file-level doc comment encodes a **design invariant**, not just a description: stats is strictly read-only, no route is public, and promoting a read to a write is an explicit decision. When adding a new route, the first check is whether this test's list still matches intent.
- The `jest.mock` factory calls `jest.requireActual('@tests/routes').securityMock()` rather than importing `securityMock` at the top level. This keeps the mock self-contained and avoids a circular import with the module under test.
- `it.each(routeSignatures(router))` means the auth assertion is data-driven: adding a new route automatically adds a new sub-test, but the *exact list* test above it will still fail if the new route isn't also added to the expected array. Both must be updated together.
