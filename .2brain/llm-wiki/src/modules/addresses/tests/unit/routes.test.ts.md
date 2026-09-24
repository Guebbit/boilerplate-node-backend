---
source: src/modules/addresses/tests/unit/routes.test.ts
sha256: 8141683081f603c32fe8a22b37f5164422848029896f7c87984c75b0bebbfd8f
generated_at: 2026-09-23T18:22:03.178275+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/tests/unit/routes.test.ts

## Purpose

Unit test for the addresses router that pins down its structural contract: the exact endpoint set and order, the router-level middleware stack (`getAuth` → `noStore`), per-route authentication, the absence of permission guards (first-person only), and the absence of module-level rate limiting or caching. It exists so that any structural change to the router is caught without exercising HTTP handlers.

## Key elements

- **`describe('addresses routes — what is mounted')`** — asserts the four endpoint signatures (`GET/POST /addresses`, `PUT/DELETE /addresses/:addressId`) in order, verifies the router-level middleware is `['getAuth', 'noStore']`, and iterates every route via `it.each` to confirm `noStore` is present on each.
- **`describe('addresses routes — authorization')`** — confirms every route carries `isAuth`, and that **no** route uses `requirePermissionGuard` (the module is strictly first-person).
- **`describe('addresses routes — no unexpected middleware')`** — scans the full middleware chain of every route to assert no `credentials-*` rate limiter and no `setCache` entry exists at the module level.
- **Cache mock** — `jest.mock('@infrastructure/http/middlewares/cache', …)` replaces the real cache middleware with `cacheMock()` before the router import, preventing side-effects during test setup.

## Relationships

- **`src/modules/addresses/routes.ts`** — the router under test; imported as `@modules/addresses/routes` and passed to every assertion helper.
- **`tests/support/routes.ts`** — provides the introspection utilities used throughout: `routeSignatures`, `routerMiddleware`, `guardsOn`, `chainOf`, and the `cacheMock()` factory. All assertions in this file are built on these helpers.

## Notes

- The mock is registered **before** the router import so that `jest.requireActual` inside the mock factory returns the real test-support module (not the mocked one). Reordering these two lines silently breaks the mock.
- `it.each(routeSignatures(router))` makes the per-route assertions self-updating: if a new endpoint is added, the existing per-route checks (noStore, isAuth, no cache) automatically cover it without editing the test.
- The "no `credentials-*`" assertion documents an intentional design decision: credential rate limiting is expected to be applied by a global (outer) middleware, not duplicated inside this module.
- The `noStore` per-route check is explicitly noted as a regression guard: a route accidentally mounted above the router-level `router.use(noStore)` call would pass the router-level assertion but would still be cacheable.
