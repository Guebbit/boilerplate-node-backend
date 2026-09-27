---
source: src/modules/orders/tests/factories.ts
sha256: a7d81d9126ba93aeef18eaa83119fbd06b68395b4513305921c526e6620f6415
generated_at: 2026-09-27T15:17:02.975524+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/factories.ts

## Purpose

Database-touching order factories for the test suite. While `../factories.ts` provides a pure in-memory builder, this file wraps that builder with real persistence operations (create, read, update, count) so integration and contract tests can seed, inspect, and force orders in the test database without touching the service layer.

## Key elements

- **`toOrderItem(product, quantity?, locale?)`** – Converts a `ProductDocument` into an `OrderLineInput`. Spreads the full document (minus `_id`, `__v`, `taxClass`) so new product columns aren't silently dropped; resolves `taxClass` → `taxRate` via `resolveTaxRate`, mirroring `freezeOrderLines`.
- **`makeOrder(user, items, extras?)`** – Builds an `OrderFixture` from a user document and line inputs, delegating to the pure `makeOrder` in `../factories.ts`. `extras` pass through verbatim (no defaults) so tests can distinguish "unset" from "explicitly chosen."
- **`orderRepository`** (re-export) – Exposes the live repository instance for `jest.spyOn`. Must be the real object (not a wrapper) so spies intercept internal calls made by sibling modules' compensation logic.
- **`createOrder(user, items, extras?)`** – Persists an order via the repository; returns the hydrated `OrderDocument`.
- **`seedOrder(status)`** – Convenience: creates a fresh user + product, builds a single-line order, and forces it to the given `OrderStatus`.
- **`readOrder(id)`** / **`findOrder(where)`** / **`countOrders(where?)`** – Raw read helpers for test assertions on persisted state.
- **`saveOrder(document)`** – Persists a document that a test has already built and mutated in memory.
- **`forceOrderStatus(orderId, status)`** – Sets any `OrderStatus` unconditionally, bypassing all lifecycle rules. Intended for testing edge states the API cannot produce (e.g., a payment attempt against a non-pending order).
- **`detachOrderUserId(userId, anonymizeAfter)`** – Unsets `userId` and writes an explicit `anonymizeAfter` date directly via `orderModel`, bypassing the per-order `createdAt`-derived clock.

## Relationships

- **`src/modules/orders/factories.ts`** – Source of the pure `makeOrder` builder and the `OrderFixture`, `OrderLineInput`, `OrderOverrides` types that this file re-uses and wraps.
- **`src/modules/orders/repository.ts`** – Provides `orderRepository` (used for all create/find/update/count calls) and is the re-export target.
- **`src/modules/orders/model.ts`** – Supplies `OrderDocument` type and `orderModel` (used directly by `detachOrderUserId`).
- **`src/infrastructure/persistence/create-repository.ts`** – Provides `toObjectId`, used by `detachOrderUserId` for the filter.
- **`src/modules/users/tests/factories`** – `createUser` consumed by `seedOrder`.
- **`src/modules/products/tests/factories`** – `createProduct` consumed by `seedOrder`.
- **`src/modules/products`** – `resolveTaxRate` and `ProductDocument` type used by `toOrderItem`.
- **Consumer test files** (orders, cart, delivery, addresses, account) import these factories to seed and assert on order data in integration/contract suites.

## Notes

- `toOrderItem` deliberately spreads the whole product document rather than listing fields, so a new catalogue column is captured automatically.
- An order line stores the **resolved** `taxRate`, never the source `taxClass`. This is intentional and mirrors production `freezeOrderLines` behavior.
- `forceOrderStatus` is a test-only backdoor. No production code path exposes an unconditional status writer; all real transitions are conditional.
- `detachOrderUserId` passes `{ timestamps: false }` to avoid shifting `updatedAt`, and targets `orderModel` directly (not the repository) to sidestep the repository's `createdAt`-derived `anonymizeAfter` logic.
- `orderRepository` is exported as the live object, not a proxy, specifically so `jest.spyOn` on it intercepts calls made by other modules' internal code (e.g., `retractOrder` compensation).
