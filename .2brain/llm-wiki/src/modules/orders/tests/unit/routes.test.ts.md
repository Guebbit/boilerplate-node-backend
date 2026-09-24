---
source: src/modules/orders/tests/unit/routes.test.ts
sha256: cb79798f5a83586473c25df4f36fc1b1da7fd81d95dc7ff4ad5959b568d5562a
generated_at: 2026-09-23T19:14:47.835729+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/routes.test.ts

## Purpose

Unit test that pins the orders router's contract: exact endpoint list and order, per-route authorization guards, cache tagging/invalidation policy, and the invoice rate-limit budget. It exists to catch silent route-table regressions (missing guards, wrong cache keys, accidental route shadowing) without spinning up an HTTP server.

## Key elements

- **`describe('order routes — what is mounted')`** — Asserts the full `routeSignatures` array and that `/search` and `/:id/invoice` appear before `/:id` (shadowing / readability convention).
- **`describe('order routes — authorization')`** — Verifies every route carries `isAuth`; that the admin-write set (`POST/PUT/DELETE /`, `PUT/DELETE /:id`, `DELETE /:id/hard`) carries `requirePermissionGuard`; that `POST /:id/cancel` deliberately does **not**; and that `POST /:id/status-override` is gated behind its own distinct permission key.
- **`describe('order routes — caching')`** — Confirms `GET /` and `POST /search` share one `setCache(3600)` under key `orders:search` with tag `orders`; `GET /:id` is cached under the same tag; `GET /:id/invoice` has **no** cache; and `invalidateCache` targets `[orders|products]` only on stock-mutating routes (`POST /`, `POST /:id/cancel`) versus `[orders]` on the rest. Also asserts `routeFlag(hardDelete)` guards only `DELETE /:id/hard`.
- **`describe('order routes — invoice rate limiting')`** — Asserts the `orders-invoice` rate-limit bucket is attached to `GET /:id/invoice` and to **no other** route.
- **Mocks (top-level `jest.mock`)** — Stub out `cache`, `route-flag`, and `rate-limit` middlewares via `cacheMock()`, `routeFlagMock()`, `securityMock()` from `@tests/routes` so the router under test can be introspected without side effects.

## Relationships

- **`src/modules/orders/routes.ts`** — The system under test; this file imports its exported `router` and asserts on its middleware chain, path order, and guard composition.
- **`tests/support/routes.ts`** — Provides the introspection helpers (`routeTable`, `routeSignatures`, `guardsOn`, `optionsOf`, `chainOf`) and the three middleware mocks used at the top of the file.

## Notes

- The file documents *why* certain assertions exist via block comments (e.g., "adding `requirePermission` to `POST /:id/cancel` would silently remove the feature"). Treat those comments as the authoritative rationale when modifying the router.
- The `products` cache-invalidation asymmetry (only `POST /` and `POST /:id/cancel` clear it) is deliberate and tested; do not "fix" it to be symmetric without understanding the stock-mutation semantics.
- Route ordering assertions (`/search` before `/:id`) protect against Express shadowing bugs, not just cosmetic ordering.
