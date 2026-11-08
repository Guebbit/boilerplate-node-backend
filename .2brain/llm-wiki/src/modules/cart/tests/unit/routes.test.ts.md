---
source: src/modules/cart/tests/unit/routes.test.ts
sha256: 745076403ada46c296400d4976a553b4896eb4a775c756a9097877007f4957e5
generated_at: 2026-11-08T05:25:12.847572+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/unit/routes.test.ts

## Purpose

Unit test for the cart router that asserts the full contract of the route table in one place: which endpoints exist, in what order, what guards protect each one, in what order those guards execute, and which infrastructure middlewares (rate-limit, idempotency, cache-invalidation) are attached. It encodes security invariants (e.g. permission check before budget spend, no shared cache) as executable assertions so regressions surface as test failures.

## Key elements

- **`ALL`** — Canonical list of the ten route signatures the cart router must expose. Used as the single source of truth for every assertion block.
- **`routeSignatures(router)`** (from `@tests/routes`) — Returns the ordered `METHOD /path` list actually mounted on the Express router.
- **`guardsOn(router, signature)`** — Returns the ordered guard-middleware names for a given route.
- **`chainOf(router, signature)`** — Returns the full ordered middleware chain (guards, rate-limiters, idempotency, cache calls) for a route.
- **`describe` blocks** — Five groups: mounting order, auth presence, permission-guild scoping + ordering, budget/idempotency ordering (checkout & merge), and cache behavior (invalidate-only on checkout; no `setCache` anywhere).
- **`jest.mock` calls** — Stub out `@infrastructure/http/middlewares/cache` and `…/rate-limit` with `cacheMock()` / `securityMock()` from the test-support module so the real Redis/throttling logic is not exercised.

## Relationships

- **`src/modules/cart/routes.ts`** — The system under test; exports the `router` instance that every assertion inspects.
- **`tests/support/routes.ts`** — Supplies the three inspection helpers (`routeSignatures`, `guardsOn`, `chainOf`) and the two factory mocks (`cacheMock`, `securityMock`) used to decouple the test from live infrastructure.

## Notes

- Guard **order** is asserted, not just presence: `isAuth` must precede `requirePermissionGuard`, and the rate-limiter (`checkout` / `cart-merge`) must sit between the permission check and `idempotencyKey`. Reordering these in the source breaks the test.
- The "no caching" test (`cached` must equal `[]`) is intentional — a cart is per-caller state, so a shared Redis key would leak one shopper's cart to another. The absence is the invariant.
- `invalidateCache([products])` is asserted only on `POST /checkout` because that is the sole route that mutates stock outside the cart domain; orders are never Redis-cached, so no `orders` invalidation is expected.
- The `ALL` array doubles as the canonical endpoint list; adding or removing a route in `routes.ts` without updating it here (or vice-versa) will fail the first test.
