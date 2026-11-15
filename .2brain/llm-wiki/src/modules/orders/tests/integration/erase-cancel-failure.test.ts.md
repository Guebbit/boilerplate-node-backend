---
source: src/modules/orders/tests/integration/erase-cancel-failure.test.ts
sha256: af22298d1a285446013d47c4b1ad8f49f72bcec830e9bc88a1ebeb6d98600fc7
generated_at: 2026-11-14T20:50:30.003272+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/erase-cancel-failure.test.ts

## Purpose

Integration test verifying that a failed cancellation of an unpaid order does **not** block or roll back an account erasure. It simulates a cancel failure (e.g. a racing payment or write conflict) and asserts the erasure still completes: the user record is deleted, the order is detached from the user, and the operation resolves `true`. The design contract is that a later reservation-sweep job cancels the orphaned order once its hold times out.

## Key elements

- **`jest.mock('@modules/orders/services/cancel', …)`** – Overrides only `cancelForErasureById` to reject with `'the write conflicted'`; all other cancel functions remain real.
- **`setupTestDb()`** – Initializes a real test database (integration-level, not unit-mocked).
- **`beforeEach → registerCheckoutModules()`** – Wires the full checkout domain (orders, products, payments) into the DI container.
- **`afterEach → resetDomainEvents()`** – Clears the in-memory domain-event bus so events don't leak between tests.
- **Single test case** – Creates a user, a product (onHand 10), and a pending single-item order; calls `eraseAsScheduled(user)`; then asserts:
  - result is `true`
  - `userRepository.findById(user.id)` is `toBeNull()`
  - reloaded order's `userId` is `toBeUndefined()` (detached)
  - reloaded order's `status` is `OrderStatus.pending` (not canceled)

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/users/tests/factories.ts` | Provides `createUser`, `eraseAsScheduled`, and `userRepository` (the SUT entry point and deletion assertion). |
| `src/modules/orders/tests/factories.ts` | Provides `createOrder`, `toOrderItem`, `readOrder` for order setup and post-erasure read-back. |
| `src/modules/products/tests/factories.ts` | Provides `createProduct` to build the ordered line item. |
| `src/modules/users/repository.ts` | `findById` used to confirm the user row is actually gone. |
| `src/kernel/events.ts` | `resetDomainEvents()` clears the event bus after each test. |
| `src/types/index.ts` | Source of the `OrderStatus` enum imported for the final status assertion. |
| `tests/support/checkout-modules.ts` | `registerCheckoutModules` registers the order/payment/product modules for the test. |
| `tests/support/setup-test-db.ts` | `setupTestDb` configures and connects the in-process test database. |

## Notes

- The mock targets **only** `cancelForErasureById`, leaving other cancel paths intact; this isolates the erasure-path failure specifically.
- The order is expected to remain in `pending` status after erasure—intentionally **not** canceled. Correctness is deferred to the reservation-sweep job, which is out of scope for this test.
- Despite living under `tests/integration/`, the file still uses `jest.mock` for the cancel service; it is "integration" in the sense of exercising a real database and full module wiring, not in the sense of zero mocks.
