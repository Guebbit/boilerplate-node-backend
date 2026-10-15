---
source: src/modules/orders/tests/unit/routes.test.ts
sha256: 74d0651a4dc2e2e5c2c83c0702d9ff1392429ee5abbf26b5bcc1e1f9edcfba1e
generated_at: 2026-10-15T11:20:39.086309+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/routes.test.ts

## Purpose

Unit test that pins the orders router's observable contract: the exact set and order of mounted endpoints, the authorization guard on each, the middleware chain ordering (permission → rate-limit → controller), and the caching / invalidation policy. It exists so that a refactored or extended router is caught the moment it silently drops, reorders, or re-permissions a route.

## Key elements

- **`describe('order routes — what is mounted')`** — asserts the full signature list via `routeSignatures`, and that `/search` and `/export` are declared before `/:id` (they would otherwise be shadowed).
- **`describe('order routes — authorization')`** — verifies `isAuth` is on every route (router-level guard), `requirePermissionGuard` is on admin-only routes, `POST /:id/cancel` is *not* admin-guarded (customer self-service), and `POST /:id/status-override` carries its own distinct permission key.
- **`describe('order routes — the export budget')`** — checks that `orders-export` (rate-limit) sits after `requirePermissionGuard` in the middleware chain for `GET /export`.
- **`describe('order routes — caching')`** — confirms GET reads use `privateNoCache` (no Redis), POSTs use `noStore`, `POST /` and `POST /:id/cancel` both trigger `invalidateCache([products])`, and `DELETE /:id/hard` is the only route behind `routeFlag(hardDelete)`.
- **Mocks** — `@infrastructure/http/middlewares/cache`, `…/route-flag`, and `…/rate-limit` are replaced with the shared fakes from `@tests/routes` so middleware order is observable without a live server.
- **Helpers imported from `@tests/routes`** — `routeTable`, `routeSignatures`, `guardsOn`, `chainOf` (and the mock factories `cacheMock`, `routeFlagMock`, `securityMock`).

## Relationships

- **`src/modules/orders/routes.ts`** — the file under test; provides the `router` instance whose routes, guards, and middleware chains are all the assertions here.
- **`tests/support/routes.ts`** — supplies the inspection helpers (`routeTable`, `routeSignatures`, `guardsOn`, `chainOf`) and the middleware mock factories used in the three `jest.mock` calls.

## Notes

- The module docblock (the `/** … */` at the top) is *documentation of the router's design decisions*, not of this test file. Key points: `requirePermission` omission on a write means "any authenticated user" (intentionally unsafe); `POST /:id/cancel` is the one customer-facing write and its safety lives in `orderService.cancelById`'s scoped check, not in a router guard; invoice / credit-note routes are mounted by the `invoicing` module at the same `/orders` base path and are absent here.
- Route-ordering tests (`/search` before `/:id`, `/export` before `/:id`) are a guard against Express's first-match semantics; removing either line without updating the test will mask a 404 or wrong-handler regression.
- Caching assertions cite RFC 9111 §3.5: responses that vary by caller identity must not be stored in a shared cache.
- `POST /:id/restore` appears in the signature list but is *not* in the admin-only `it.each` list — verify intentionally before adding it to the guard expectations.
