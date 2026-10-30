---
source: src/modules/orders/tests/integration/erase-cancel-failure.test.ts
sha256: 5e73cfa94aedfa2276f26003471735ff1ef1e1067f1cb603b28a94d0d44a7d8c
generated_at: 2026-10-29T04:52:36.415552+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/erase-cancel-failure.test.ts

## Purpose

Integration test verifying that when the cancel step of an account erasure fails (e.g. a write conflict on the order), the erasure still completes: the user record is deleted, the order is detached from the user, and the operation resolves as success. The design intent is that a missed cancel is a non-fatal edge case handled later by the reservation-sweep timeout.

## Key elements

- **Jest mock of `@modules/orders/services/cancel`** — Spreads the real module but overrides `cancelForErasureById` to always reject, simulating a payment race or write conflict.
- **`setupTestDb()`** — Initialises the in-memory/ephemeral database before the suite.
- **`registerCheckoutModules()`** (in `beforeEach`) — Wires up the checkout module graph so the erasure pipeline can be exercised end-to-end.
- **`resetDomainEvents()`** (in `afterEach`) — Clears the domain-event bus between tests to avoid cross-test contamination.
- **`describe` / `it` block** — Creates a user, a product, and an unpaid order, then calls `eraseAsScheduled(user)` and asserts: `result.success === true`, `userRepository.findById(user.id)` returns `null`, the reloaded order's `userId` is `undefined`, and the order's `status` remains `OrderStatus.pending`.

## Relationships

- **`tests/support/setup-test-db.ts`** — Supplies `setupTestDb`, the entry point for the test database lifecycle.
- **`src/modules/users/tests/factories.ts`** — Supplies `createUser`, `eraseAsScheduled` (the system under test), and `userRepository` (used to assert the user row is gone).
- **`src/modules/products/tests/factories.ts`** — Supplies `createProduct` to build the order line-item's product.
- **`src/modules/orders/tests/factories.ts`** — Supplies `createOrder`, `toOrderItem`, and `readOrder` for order construction and verification.
- **`src/kernel/events.ts`** — Supplies `resetDomainEvents` to isolate the event bus per test.
- **`tests/support/checkout-modules.ts`** — Supplies `registerCheckoutModules` to assemble the checkout module graph for integration testing.
- **`src/types/index.ts`** — Supplies the `OrderStatus` enum used in the status assertion.

## Notes

- The mock preserves the rest of the cancel service via `...jest.requireActual(...)`, so only the erasure-specific cancel path is stubbed; other cancel functions remain functional.
- The order is intentionally left in `OrderStatus.pending` (not `cancelled`) — the test codifies the contract that the reservation sweep, not the erasure routine, is responsible for cleaning up the missed cancellation.
- `eraseAsScheduled` is imported from the users factory, meaning the test exercises the users module's erasure flow rather than a dedicated orders-module function.
