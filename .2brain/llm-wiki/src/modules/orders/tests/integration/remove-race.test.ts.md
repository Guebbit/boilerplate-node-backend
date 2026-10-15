---
source: src/modules/orders/tests/integration/remove-race.test.ts
sha256: da88fa58c928052a2a197a8e0dabc0304286e5215226728714b098c76a59d6cb
generated_at: 2026-10-15T11:16:24.710057+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/remove-race.test.ts

## Purpose
Integration tests (against real MongoDB) that verify `remove` correctly rejects a hard delete when the order's `status` or `paidAt` changes after the caller's read but before the conditional write commits. It also confirms the happy-path delete and the 404 path when the document is already gone.

## Key elements
- **`cancelledOrder`** – async helper that creates a user, product, and a `cancelled`-status order, then reads the order back and returns `{ order, orderId }`. Simulates the stale read that `removeById` hands to `remove`.
- **`describe('remove: a hard delete')`** – four test cases:
  - *Settlement race* – calls `markOrderPaidAt` after the read, then `remove(order, true)`; expects 409 / `ORDER_INVOICED` and the document to still exist.
  - *Reopen race* – calls `forceOrderStatus(orderId, 'pending')` after the read; expects 409 / `ORDER_NOT_CANCELLED`.
  - *Concurrent delete* – removes the order first, then calls `remove` on the stale object; expects 404.
  - *Happy path* – no intervening mutation; expects `result.success === true` and the document gone.

## Relationships
- **`src/modules/orders/services/remove.ts`** – the system under test; the `remove(order, hardDelete)` function whose conditional-write semantics are being verified.
- **`src/modules/orders/tests/factories.ts`** – provides `createOrder`, `forceOrderStatus`, `toOrderItem`, `markOrderPaidAt`, and `readOrder`, used to set up and mutate order state.
- **`src/modules/products/tests/factories.ts`** – `createProduct` to seed a product for the order items.
- **`src/modules/users/tests/factories.ts`** – `createUser` to seed the ordering user.
- **`tests/support/response.ts`** – `asReject` to unwrap a failed result into `{ status, errors }` for assertions.
- **`tests/support/setup-test-db.ts`** – `setupTestDb` to provision a real MongoDB instance for the test run.

## Notes
- Tests run against **real MongoDB** (no in-memory mock), so the race-condition scenarios depend on actual document state in the database rather than injected stubs.
- The race is simulated sequentially (mutate the doc → call `remove` with the *pre-mutation* object), not with true concurrency; this is sufficient because `remove`'s guard is a conditional write, not a lock.
- The `order` object passed to `remove` in each race case is deliberately **stale** (read before the mutation), mirroring what `removeById` would hand it.
- `remove` is always called with `hardDelete = true`; the soft-delete path is not exercised here.
