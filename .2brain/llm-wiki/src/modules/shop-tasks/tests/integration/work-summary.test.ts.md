---
source: src/modules/shop-tasks/tests/integration/work-summary.test.ts
sha256: ec6f07e00d8bd9dc6778a3f7b8770e8dcf15addb114f5e8ce3f8c85be3b8ed29
generated_at: 2026-11-14T21:58:36.320518+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/tests/integration/work-summary.test.ts

## Purpose

Integration test for `GET /shop-tasks/summary`. Verifies that each summary count matches the total returned by the corresponding list endpoint, that role-based rules restrict which keys a caller receives, that counts update when an order changes state, and that a zero count is sent as the number `0` rather than omitted.

## Key elements

- **`setupTestDb()`** — resets/initialises the test database before the suite.
- **`afterEach(() => resetDomainEvents())`** — clears the in-memory domain-event bus between tests.
- **`summaryFor(bearer)`** — thin wrapper that issues `GET /shop-tasks/summary` with a Bearer token.
- **`listTotal(bearer, url)`** — fetches a list endpoint and extracts `body.meta.totalItems`; used as the "expected" count in assertions.
- **`orderIn(status, extras?)`** — creates a fresh buyer, a product, and an order in the given `OrderStatus`; module-level `buyers` counter guarantees unique e-mail/username per call.
- **Test cases:**
  - *Counts match list totals (admin)* — seeds paid, processing, pending, and soft-deleted orders plus a return and a zero-stock product; asserts each summary key equals the corresponding list total, then spot-checks `salesOrders === 2` and `inventory > 0`.
  - *One payment needing attention + one late preorder* — records an offline cash payment then a partial refund (→ `salesPayments: 1`); creates a paid preorder whose `expectedAt` is in the past (→ `salesPreorders: 1`).
  - *Zero is sent as zero* — with no data, all five keys are present and equal `0`.
  - *Order leaving work leaves the count* — two paid orders, one advanced to `shipped`; summary drops to `1`.
  - *Role-restricted keys* — a `warehouse`-role caller receives only `inventory`, `returns`, `salesOrders`, `salesPreorders` (no `salesPayments`).

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/setup-test-db.ts` | `setupTestDb` initialises the test database before the suite. |
| `tests/support/http.ts` | `api`, `authenticateAs`, `authenticateAsRole` provide the HTTP client and token helpers. |
| `tests/support/callers.ts` | `asAdmin`, `callerContextAs` build service-layer caller contexts passed to payment calls. |
| `src/kernel/events.ts` | `resetDomainEvents` is called in `afterEach` to clear the event bus between tests. |
| `src/modules/users/tests/factories.ts` | `createUser` creates a buyer per order. |
| `src/modules/products/tests/factories.ts` | `createProduct` seeds products for orders and the low-stock scenario. |
| `src/modules/orders/tests/factories.ts` | `createOrder`, `forceOrderStatus`, `toOrderItem` build and mutate order state. |
| `src/modules/inventory/tests/factories.ts` | `forceStockLevel` sets a product's stock to zero for the inventory count. |
| `src/modules/returns/tests/factories.ts` | `insertBareReturns` inserts a requested return directly. |
| `src/modules/delivery/tests/factories.ts` | `paidPreorderOrder`, `fulfillmentOrdersOf`, `setFulfillmentOrderState` set up the late-preorder fixture. |
| `src/modules/payments/index.ts` | `paymentService` is imported and used to record an offline cash payment. |
| `src/modules/payments/tests/factories.ts` | `refundOrderPayment` triggers a partial refund so the payment enters the "needs attention" state. |
| `src/types/index.ts` | `OrderStatus` enum values used when seeding orders. |

## Notes

- Assertions compare summary values against **live list-endpoint totals** (`listTotal`) rather than hard-coded numbers, keeping the test in lock-step with whatever the list queries return. A secondary hard-coded check (`salesOrders === 2`, `inventory > 0`) guards against both the summary and the list accidentally returning `0`.
- The `buyers` counter is module-scoped, so it increments across tests within the file but resets per test-file run.
- The role-visibility test asserts the **set of keys** (sorted) rather than their values, intentionally decoupling "which screens exist" from "how many rows each screen shows."
