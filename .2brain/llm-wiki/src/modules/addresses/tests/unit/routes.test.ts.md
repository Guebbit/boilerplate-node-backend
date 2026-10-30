---
source: src/modules/addresses/tests/unit/routes.test.ts
sha256: 64a68739862aba4f66c4814b28fa440ab627eca582696c6589d18f00b74531c2
generated_at: 2026-10-29T03:11:05.855966+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/tests/unit/routes.test.ts

## Purpose

Unit tests that pin down the addresses router's contract: which endpoints exist (and in what order), which middleware guards protect them, and what must *not* be present (permission keys, rate limiting, caching). The file exists to catch regressions where a route is added, reordered, or accidentally made public/storable.

## Key elements

- **`describe('addresses routes — what is mounted')`** — Asserts the exact ordered list of 7 route signatures (`GET/POST /addresses`, `GET/PUT/PATCH /addresses/:addressId`, `PUT /addresses/:addressId/default`, `DELETE /addresses/:addressId`). Also verifies `getAuth` and `noStore` are the router-level middleware and that every individual route carries `noStore`.
- **`describe('addresses routes — authorization')`** — Confirms every route includes the `isAuth` guard and that no route uses `requirePermissionGuard` (all are first-person operations).
- **`describe('addresses routes — no unexpected middleware')`** — Asserts no route chain contains `credentials-*` rate-limiting or `setCache` entries.
- **Test utilities** (`routeSignatures`, `routerMiddleware`, `guardsOn`, `chainOf`) — imported from `@tests/routes`; these inspect the router object rather than making HTTP calls.
- **Cache mock** — `jest.mock('@infrastructure/http/middlewares/cache', …)` replaced with `cacheMock()` from the test support module, so the router import doesn't pull in real cache logic.

## Relationships

- **`src/modules/addresses/routes.ts`** — The unit under test; this file imports its `router` export and inspects it exclusively.
- **`tests/support/routes.ts`** — Supplies all four inspection helpers (`routeSignatures`, `routerMiddleware`, `guardsOn`, `chainOf`) and the `cacheMock` factory.

## Notes

- The JSDoc block at the top documents a design constraint that is *not* directly asserted by any test: the router shares the `/account` prefix with the `account` module's router, so `getAuth`/`noStore` coverage must be identical. The tests verify the *effect* (guards present) but not the prefix-sharing relationship itself.
- The per-route `noStore` check (`it.each`) exists specifically to catch a route accidentally mounted *above* `router.use(noStore)`, which would make it storable by a shared cache or browser despite the router-level middleware.
- No HTTP calls are made; all assertions operate on the in-memory router object.
