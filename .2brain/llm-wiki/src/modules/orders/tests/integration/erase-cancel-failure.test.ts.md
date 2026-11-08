---
source: src/modules/orders/tests/integration/erase-cancel-failure.test.ts
sha256: 3c67b6240296c62507e7d41f698c2628332175418e9f6d62afadaaae0c7a3683
generated_at: 2026-11-08T07:04:12.842849+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/erase-cancel-failure.test.ts

## Purpose

Integration test verifying that when canceling an erased account's unpaid order fails (e.g., a payment race or write conflict), the erasure operation still completes successfully: the account is removed, the order is detached from the user, and the delete call resolves. The assumption is that the reservation sweep will eventually cancel the orphaned order when its hold times out.

## Key elements

- **`jest.mock('@modules/orders/services/cancel', …)`** — Overrides `cancelForErasureById` to always reject with `"the write conflicted"`, simulating a failed cancel while keeping the rest of the module intact.
- **`describe('erasing an account whose unpaid order cannot be canceled')`** — Contains the single test case.
- **Test: `'still erases the account, detaches the order, and resolves'`** — Creates a user, product, and order; calls `eraseAsScheduled(user)`; then asserts `result.success === true`, the user is gone from the repository, the reloaded order has `userId` set to `undefined`, and the order status remains `OrderStatus.pending`.
- **`setupTestDb()`** — Initialises the in-memory test database before the suite runs.
- **`beforeEach` / `afterEach`** — Registers checkout modules per test and resets domain events after each test.

## Relationships

- **`src/modules/users/tests/factories.ts`** — Source of `createUser`, `eraseAsScheduled` (the system under test), and `userRepository` (used to assert the user is deleted).
- **`src/modules/orders/tests/factories.ts`** — Provides `createOrder`, `toOrderItem`, and `readOrder` for setting up and inspecting order state.
- **`src/modules/products/tests/factories.ts`** — Provides `createProduct` to seed an inventory item.
- **`src/modules/users/repository.ts`** — The `userRepository` imported via the users factories is the actual repository instance checked in the assertion (`findById`).
- **`src/kernel/events.ts`** — `resetDomainEvents` is called in `afterEach` to clear any queued domain events between tests.
- **`src/types/index.ts`** — Supplies the `OrderStatus` enum used in the status assertion.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules` wires up module registrations required for the erasure pipeline to run.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the test database before any tests execute.

## Notes

- The mock only replaces `cancelForErasureById`; all other exports from the cancel service are preserved via `jest.requireActual`. This keeps the test focused on the single failure path.
- The order's status is asserted to remain `pending` (not `canceled` or `failed`), confirming that the detach logic removes the user link without mutating the order's lifecycle state.
- The design intent (per the module docstring) is that a missed cancel is tolerable because the reservation sweep provides a safety-net cancellation after the hold expires.
