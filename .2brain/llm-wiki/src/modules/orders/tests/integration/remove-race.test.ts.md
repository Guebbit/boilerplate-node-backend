---
source: src/modules/orders/tests/integration/remove-race.test.ts
sha256: 587cd58cfb338cbed012a32d218ac4cd5bd5ec999a2759a01730e98f15ac3cda
generated_at: 2026-11-08T07:08:27.080856+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/remove-race.test.ts

## Purpose

Integration tests that verify `remove` correctly handles race conditions: if a settlement, reopen, or concurrent delete commits *after* `remove` read the document but *before* it issues its conditional write, the delete must abort with the appropriate error instead of destroying the order. Runs against a real MongoDB instance.

## Key elements

- **`canceledOrder()`** — Helper that creates a user, a product, and a canceled/unpaid order, then reads the order back. Returns both the order document and its string ID.
- **`describe('remove: a hard delete')`** — Four cases:
  - *Settlement race*: calls `markOrderPaidAt` after the order snapshot is taken; expects `409 ORDER_INVOICED` and the order to still exist.
  - *Reopen race*: calls `forceOrderStatus(id, 'pending')` after the snapshot; expects `409 ORDER_NOT_CANCELED` and the order to still exist.
  - *Concurrent-delete race*: performs a full `remove` (deleting the doc), then calls `remove` again with the original stale snapshot; expects `404`.
  - *Happy path*: calls `remove` on a stale-but-still-valid canceled/unpaid order; expects `success: true` and the document gone.

## Relationships

- **`src/modules/orders/services/remove.ts`** — The service under test; its `remove` export is the function being exercised.
- **`src/modules/orders/tests/factories.ts`** — Supplies `createOrder`, `forceOrderStatus`, `toOrderItem`, `markOrderPaidAt`, and `readOrder` used to set up and inspect order state.
- **`src/modules/products/tests/factories.ts`** — Supplies `createProduct` for the product attached to the test order.
- **`src/modules/users/tests/factories.ts`** — Supplies `createUser` for the order owner.
- **`tests/support/response.ts`** — Supplies `asReject`, a type-narrowing helper that extracts the rejection payload from a `remove` result for assertion.
- **`tests/support/setup-test-db.ts`** — Supplies `setupTestDb`, which spins up a real Mongo instance for the test process.

## Notes

- The "race" is simulated by mutating the document in the DB *after* the snapshot is captured but *before* `remove` is called. The stale snapshot is then handed to `remove`, mimicking the window where another transaction committed in the meantime.
- `forceOrderStatus` and `markOrderPaidAt` are factory-level mutation helpers that write directly to the DB, bypassing normal business-flow services — this is intentional to model an external concurrent writer.
- The file uses real MongoDB (via `setupTestDb`), not an in-memory mock, so conditional-write semantics (e.g., `findAndDelete` with a filter) are tested for real.
