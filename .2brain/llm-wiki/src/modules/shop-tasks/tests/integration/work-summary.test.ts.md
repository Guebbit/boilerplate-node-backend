---
source: src/modules/shop-tasks/tests/integration/work-summary.test.ts
source_sha256: ec6f07e00d8bd9dc6778a3f7b8770e8dcf15addb114f5e8ce3f8c85be3b8ed29
context_sha256: 5cd96dda78cb766b129421e51d4d071325c17dd77f17c10ef17c08b86e42cdc8
generated_at: 2026-11-22T07:45:52.528085+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop-tasks/tests/integration/work-summary.test.ts

## Purpose
Integration test for `GET /shop-tasks/summary` running against the real app and a test database. It checks that each count equals the total of the list its screen shows, that callers only see keys for screens their role may open, that an order leaving the work leaves the count, and that zero is returned as zero rather than omitted.

## Key elements
- `summaryFor(bearer)`: calls the summary endpoint with an Authorization header.
- `listTotal(bearer, url)`: fetches a list endpoint and returns `meta.totalItems`, used as the expected value for the matching summary key.
- `orderIn(status, extras)`: creates an order in a given status for a fresh buyer (unique email/username via a module-level `buyers` counter), with one product item.
- `afterEach(resetDomainEvents)`: clears domain events between tests; `setupTestDb()` sets up the database.
- Tests:
  - Admin: each key (`salesOrders`, `salesPayments`, `returns`, `salesPreorders`, `inventory`) equals the corresponding list total. It seeds paid, processing, pending and soft-deleted orders, a requested return and a zero-stock product. It also asserts `salesOrders` is 2 and `inventory` is above 0, so the agreement isn't trivially empty.
  - One cash payment with a hand-paid refund still owed counts as 1 in `salesPayments`. One paid preorder whose `expectedAt` is in the past counts as 1 in `salesPreorders`.
  - A fresh database returns all five keys as `0` for an admin.
  - Moving a paid order to `shipped` drops `salesOrders` from 2 to 1.
  - A `warehouse` caller gets exactly `inventory`, `returns`, `salesOrders` and `salesPreorders`, with no `salesPayments`.

## Relationships
- `@tests/setup-test-db`, `@tests/http` (`api`, `authenticateAs`, `authenticateAsRole`) and `@tests/callers` (`asAdmin`, `callerContextAs`) provide the DB setup, HTTP client, authentication and caller contexts.
- Factories from the users, products, orders (`createOrder`, `forceOrderStatus`, `toOrderItem`), inventory (`forceStockLevel`), returns (`insertBareReturns`), delivery (`paidPreorderOrder`, `fulfillmentOrdersOf`, `setFulfillmentOrderState`) and payments (`refundOrderPayment`) modules seed the data.
- `paymentService` from `@modules/payments` records the offline cash payment directly (`recordOfflinePayment`).
- `resetDomainEvents` from `@kernel/events` is called after each test.
- `OrderStatus` from `@types` supplies the status values.
- The list endpoints it compares against are `/orders`, `/returns`, `/delivery/fulfillment-orders` and `/inventory/levels`.

## Notes
- `salesPayments` is only compared against a literal `0` in the first test. It is verified as non-zero in the separate payment-and-preorder test.
- Date offsets of ±86,400,000 ms (one day) are used to make the preorder's release date future and its expected date past.
