---
source: src/modules/delivery/tests/integration/preorder-board.test.ts
source_sha256: 572b1c275e6b6871b84207904e5dc9bc4d890749a68f8fc1fa9e0ea7f7494336
context_sha256: 0d0a020f40584633803733479895c2c417714f271737e152a8027d9caa783dab
generated_at: 2026-11-22T05:01:53.119038+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/tests/integration/preorder-board.test.ts

## Purpose
Integration tests for the delivery module's preorder board reads, run against fulfillment orders in every state. Its main job is to keep two separately written implementations of the state rule in agreement: the Mongo filter condition and `boardStateOf`. It also covers the Late view, the due-soon warning, the product summary totals, and per-caller row visibility.

## Key elements
- **Setup**: `setupTestDb()`, plus a `beforeEach` that resets domain events, calls `deliveryModule.subscribe()` and `markDomainEventsWired()`. An `afterEach` resets domain events again. The mailer's `enqueueEmail` is mocked with `jest.fn()`.
- **Helpers**:
  - `inDays(days)` returns a date `days` from now, in whole `DAY` (86,400,000 ms) units.
  - `placed(quantity, days, buyer?)` creates a paid preorder order and then its fulfillment orders.
  - `arrive(productId, quantity)` calls `inventoryService.receive`, then `settleOutboxNudges()` so the allocation reaches delivery.
  - `board(query, now?)` returns the items from `deliveryService.listPreorderFulfillmentOrders` as an admin.
  - `orderIdsOf(rows)` returns the sorted order ids of the rows.
  - `everyState()` places six preorders, one per state to be reached.
- **Test groups**:
  - *State filters*: each `state` filter (`waiting`, `allocated`, `shipped`, `canceled`) must match the rows whose own `state` says so. A held fulfillment order is also created. A shipped row's `delivered` flag separates a shipment still out from one that arrived.
  - *Late view and due-soon*: `late: true` with an injected `now`, `dueWithin: 7`, and `slippedDays` after a product's `releaseDate` is moved (expected 10).
  - *Product summary*: `summarizePreorders` gives per-product `paid`, `allocated`, `waiting`, `shipped`, `canceled` and `late` counts. The states sum to `paid`, and `late` is a subset of `waiting`.
  - *Access*: a buyer sees only their own rows, in both the list and the summary. An admin sees all. A caller with no session sees none.
  - *Cause filter*: `preorder`, `backorder` and `any`.

## Relationships
- Calls `deliveryService` (`delivery/services`) for list, summarize, cancel and hold operations.
- Uses `deliveryModule` to subscribe delivery handlers to domain events, and `resetDomainEvents` / `markDomainEventsWired` from `@kernel/events` to manage that wiring per test.
- Uses `settleOutboxNudges` from `@kernel/outbox` to flush async propagation after inventory or product changes.
- Uses the inventory module (`@modules/inventory`) and the products module (`@modules/products`) to trigger allocation (receiving stock) and release-date changes.
- Imports from `delivery/tests/factories`: `paidPreorderOrder`, `paidBackorderOrder`, `fulfillmentOrdersOf`, `shipEverything` and `deliverEverything`.
- Imports `forceOrderStatus` from `orders/tests/factories`, and `OrderStatus` from `@types`.
- Uses `shopDayOf` from the shop module to build release dates.
- Uses `setupTestDb` and the caller helpers `asAdmin`, `asCustomer`, `callerContextAs` and `testCallerContext` from `tests/support`.

## Notes
- Some expectations check the injected `now` against the real clock. For example, `board({ late: true })` without `now` must return `[]`, while the same filter with `inDays(20)` returns the overdue rows.
- A late row can be allocated but unshipped. A test comment says the sweep would leave such a row alone.
- Tests mostly compare filtered results against `everyone.filter(row.state === state)`, rather than hard-coding which rows belong to each state.
- The `everyState` test also asserts that every state is actually present, so the filter checks can't pass on empty sets.
