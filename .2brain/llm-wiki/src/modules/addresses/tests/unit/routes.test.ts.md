---
source: src/modules/addresses/tests/unit/routes.test.ts
sha256: 64a68739862aba4f66c4814b28fa440ab627eca582696c6589d18f00b74531c2
generated_at: 2026-11-08T04:58:15.767520+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/tests/unit/routes.test.ts

## Purpose

Unit test for the addresses router that asserts the complete route table (signatures, order, middleware, guards) without executing any handler logic. It exists to catch unintended route additions, missing `noStore`/`isAuth` guards, and stray middleware (rate-limiting, caching) in the first-person address-book module.

## Key elements

- **`describe('addresses routes — what is mounted')`** — verifies the exact route signatures and their order, asserts router-level middleware is `['getAuth', 'noStore']`, and iterates every route to confirm `noStore` appears in its guard list (catches routes mounted above `router.use(noStore)`).
- **`describe('addresses routes — authorization')`** — confirms every route carries `isAuth` and that no route uses `requirePermissionGuard` (all endpoints are caller-on-own-rows).
- **`describe('addresses routes — no unexpected middleware')`** — asserts no route's middleware chain contains entries prefixed `credentials-` or `setCache`.
- **`jest.mock('@infrastructure/http/middlewares/cache', …)`** — replaces the real cache middleware with a mock provided by `@tests/routes` so route-chain inspection stays deterministic.

## Relationships

- **`src/modules/addresses/routes.ts`** — the module under test; its named export `router` is imported and passed to every assertion helper.
- **`tests/support/routes.ts`** — provides the test-utility functions `routeSignatures`, `routerMiddleware`, `guardsOn`, `chainOf`, and the `cacheMock()` factory used by the jest mock.

## Notes

- The `noStore` check is done **per-route via `guardsOn`**, not just at the router level, specifically to guard against a route declared *before* `router.use(noStore)` (a silent regression the router-level check alone would miss).
- The file deliberately asserts the **absence** of `requirePermissionGuard`, `credentials-*` entries, and `setCache` entries — these "negative" tests are as important as the positive ones because the addresses module is strictly first-person and must rely on the global rate-limit brake.
- `chainOf` returns the full middleware chain (including router-level entries) for a given signature; `guardsOn` returns only guard-level entries. Don't confuse the two when adding new assertions.
