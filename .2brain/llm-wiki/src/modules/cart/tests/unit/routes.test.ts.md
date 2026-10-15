---
source: src/modules/cart/tests/unit/routes.test.ts
sha256: 145c36cfeca15263ea390733de8cc3218007425aad71794b98a883971f3876b7
generated_at: 2026-10-15T10:25:54.275193+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/unit/routes.test.ts

## Purpose

Unit test for the cart router (`src/modules/cart/routes.ts`). It locks down the route table (which endpoints exist, in what order), the authorization and permission guards on every route, the placement of rate-limit budget keys and idempotency middleware in the checkout/merge chains, and the cache-invalidation / no-cache invariants. The file exists to make regressions in guard order or accidental cache writes fail immediately rather than in production.

## Key elements

- **`ALL`** – Canonical array of the 11 route signatures (method + path) the cart router must expose, in the exact order Express should match them.
- **`describe('cart routes — what is mounted')`** – Asserts `routeSignatures(router)` equals `ALL` and that literal segments (`/summary`, `/checkout`, `/all`, `/shipping-method`) are declared before `/:productId`.
- **`describe('cart routes — authorization')`** – `it.each(ALL)` verifies every route carries the `isAuth` guard.
- **`describe('cart routes — who shops')`** – Verifies `requirePermissionGuard` is present on every route and is ordered *after* `isAuth`.
- **`describe('cart routes — the checkout budget')`** – Confirms the `checkout` rate-limit key appears only on `POST /checkout` and sits between `requirePermissionGuard` and `idempotencyKey` in the chain.
- **`describe('cart routes — a merge …')`** – Asserts `POST /merge` carries `idempotencyKey` and its own `cart-merge` budget key before that key.
- **`describe('cart routes — caching')`** – Asserts `POST /checkout` calls `invalidateCache([products])`, and that *no* cart route sets a cache entry (negative invariant).

## Relationships

- **`src/modules/cart/routes.ts`** – The module under test; its exported `router` is the sole input to every assertion in this file.
- **`tests/support/routes.ts`** – Supplies the test-harness utilities used throughout: `routeTable`, `routeSignatures`, `guardsOn`, `chainOf` (chain-inspection helpers), plus `cacheMock()` and `securityMock()` factory functions consumed by the two `jest.mock` hoists for the infrastructure middlewares.

## Notes

- **Route order is a correctness invariant, not a style choice.** Express matches first-come-first-served; the test explicitly checks that literal segments precede `/:productId` so a future reordering doesn't silently turn `DELETE /cart/all` into a product lookup.
- **Middleware-chain ordering is asserted, not assumed.** The `chainOf` helper returns the middleware array in execution order; tests use `indexOf` comparisons to pin the relative position of budget keys, permission guards, and the idempotency ledger.
- **Absence is tested as presence.** The "no cart route caches" test filters for `setCache*` entries and asserts an empty array—protecting against a future `res.setCache` that would leak one shopper's cart to another.
- **Mocks are hoisted before the `import { router }`.** The `jest.mock` calls for `cache` and `rate-limit` reference `@tests/routes` (the support module) so the real router module loads with stubbed infrastructure, keeping the test isolated from Redis or token-bucket side-effects.
