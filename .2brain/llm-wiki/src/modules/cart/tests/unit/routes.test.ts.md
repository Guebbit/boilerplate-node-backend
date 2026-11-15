---
source: src/modules/cart/tests/unit/routes.test.ts
sha256: c6cfbea5b5a9abd182baa76ade5f8da29276d0c706e83b42394ad9578b5719fa
generated_at: 2026-11-14T19:37:06.725757+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/unit/routes.test.ts

## Purpose

Unit tests for the cart route table. Verifies the exact set and order of mounted endpoints, the authorization guards on each, the relative ordering of middleware in each chain (permission → budget → idempotency), and the caching/idempotency guarantees that protect per-caller state and bounded spending.

## Key elements

- **`ALL`** – Canonical array of the ten cart route signatures (method + path). Serves as the single source of truth for which endpoints exist and in what order.
- **`describe("cart routes — what is mounted")`** – Asserts `routeSignatures(router)` equals `ALL` exactly (order-sensitive).
- **`describe("cart routes — authorization")`** – Iterates every entry in `ALL` and asserts `guardsOn` includes `isAuth`.
- **`describe("cart routes — who spends")`** – Confirms only `POST /checkout` carries `requirePermissionGuard`, and that it is ordered *after* `isAuth`.
- **`describe("cart routes — the checkout budget")`** – Asserts the `checkout` budget appears on `POST /checkout` alone, and that it sits between `requirePermissionGuard` and `idempotencyKey` in the chain.
- **`describe("cart routes — a merge …")`** – Asserts `POST /merge` is idempotent (`idempotencyKey`) and that its own `cart-merge` budget is consumed *before* the idempotency ledger.
- **`describe("cart routes — caching")`** – Asserts `POST /checkout` invalidates the `products` cache; asserts **no** cart route calls `setCache` (per-caller state must never be shared).
- **Mock setup (top of file)** – `@infrastructure/http/middlewares/cache` and `@infrastructure/http/middlewares/rate-limit` are replaced with `cacheMock()` / `securityMock()` pulled from `@tests/routes`.

## Relationships

- **`src/modules/cart/routes.ts`** – The module under test. This file imports its exported `router` and inspects its route table and middleware chains via the test helpers.
- **`tests/support/routes.ts`** – Provides the three introspection helpers (`routeSignatures`, `guardsOn`, `chainOf`) used throughout the tests, and the mock factories (`cacheMock`, `securityMock`) referenced in the `jest.mock` calls at the top of this file.

## Notes

- Middleware **ordering** is the contract, not just presence. The tests assert `indexOf` relationships (e.g., budget after permission, budget before idempotency) because a wrong order changes security semantics (a refused caller spending budget, or a replayed request escaping it).
- The "caches nothing" check is an **absence assertion**: the invariant is that zero cart routes write to a shared cache, so the test explicitly verifies the list is empty rather than relying on the other positive assertions.
- The cache and rate-limit mocks are resolved through `tests/support/routes.ts` (imported as `@tests/routes`) rather than defined inline. This means the mock factories must be kept in sync with that support file.
