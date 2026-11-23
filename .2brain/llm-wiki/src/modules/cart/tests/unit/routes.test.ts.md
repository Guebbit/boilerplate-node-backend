---
source: src/modules/cart/tests/unit/routes.test.ts
source_sha256: f7b1b65ea5b31de8bb7f0cbfc9a6d05f972ede45bd94fd770245c47a2a6fe286
context_sha256: 36c90008fe09ef144495e4ec122c7c93650ed6994a67bb402b7fa3dd2ed9a44d
generated_at: 2026-11-22T04:43:42.946962+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/unit/routes.test.ts

## Purpose
Unit test that pins the cart module's route table: which endpoints are mounted, in what order, and which middleware guards each one. It makes adding or changing a cart route a deliberate act, and locks in the security and idempotency invariants of checkout, merge, and caching.

## Key elements
- `ALL`: the explicit list of the 10 expected route signatures (e.g. `GET /summary`, `POST /checkout`, `POST /merge`, `PATCH /items/:productId`). It is the source of truth for the "mounted" test and the iteration set for the others.
- **Mounted endpoints**: `routeSignatures(router)` must equal `ALL` exactly, including order.
- **Authorization**: every route in `ALL` must have `isAuth` among its guards.
- **Who spends**: only `POST /checkout` carries `requirePermissionGuard`, and `isAuth` must come before it in the guard list.
- **Checkout budget**: only `POST /checkout` has a `checkout` entry in its chain. That entry sits after `requirePermissionGuard` and before `idempotencyKey`. An in-file comment explains why: a refused caller must not spend the budget, and a replayed request must not escape it.
- **Merge**: `POST /merge` includes `idempotencyKey`. Its own `cart-merge` budget entry must be present and come before `idempotencyKey`.
- **Caching**: no route's chain may contain an entry starting with `setCache`, because a cart is per-caller state and a shared cache could serve one shopper's cart to another.

## Relationships
- Imports `router` from `src/modules/cart/routes.ts`, the unit under test.
- Imports `routeSignatures`, `guardsOn`, and `chainOf` from `tests/support/routes.ts` (via the `@tests/routes` alias). These helpers read the router's signatures, guard names, and middleware chain.
- Also uses `cacheMock()` and `securityMock()` from `tests/support/routes.ts`, which stand in for the `@infrastructure/http/middlewares/cache` and `@infrastructure/http/middlewares/rate-limit` modules.

## Notes
- The mocks are registered before the `router` import, so the router is built with the mocked middlewares.
- The module header says every route is authenticated at the router level and needs no rule except `/checkout`, which needs `checkout:Cart` (see `shared/authorization-keys.generated.yaml`).
- The header also says lines are written under `/items`, so no root parameter route competes with a literal segment.
- The tests inspect middleware names, not behavior. Renaming a guard or budget entry (`isAuth`, `requirePermissionGuard`, `checkout`, `cart-merge`, `idempotencyKey`) will break them.
