---
source: src/modules/delivery/services/board.ts
source_sha256: 152e7e2baec86218a6c33c9edbb8c9ed4329c17d9dc0e38ff43ce1521eef95ee
context_sha256: 75e56bc0b573ce94baa057acb945a0c3cd96f6c572598ca99207f0d760e69dbf
generated_at: 2026-11-22T04:53:06.033950+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/services/board.ts

## Purpose
Read-side services behind the admin preorder board. It returns pages of preorder fulfillment orders (with buyer and payment info) and per-product preorder unit counts. `delivery` owns the dates, consent state and hold, so it answers the queries. Buyer details and `paidAt` are fetched from `orders` in one batched read per page.

## Key elements
- `BoardQuery`: the list route's input. It extends `PaginationInput` with optional `cause`, `state`, `productId`, `late` and `dueWithin`.
- `listPreorderFulfillmentOrders(query, authContext, now = new Date())`: returns `{ items, meta }`, the earliest expected first.
  - It normalizes the pagination and strips `page` and `pageSize` from the filters.
  - It adds the caller's readable order ids to the filters, then calls `fulfillmentOrderRepository.searchBoard`.
  - It then loads order briefs and shipments for the page in parallel.
  - It presents each row with `presentPreorderFulfillmentOrder`, passing the brief, a delivered flag and `now`.
- `summarizePreorders(query, authContext, now = new Date())`: returns `{ items, meta }` of per-product unit counts, the earliest promise first. It uses `fulfillmentOrderRepository.summarizeProducts` and `presentProductSummary`. The query accepts only `productId`, `page` and `pageSize`.
- `readableOrders` (internal): works out which orders the caller may read.
  - No `authContext` gives `[]`, so nothing is readable.
  - A caller holding `display:Order` gets `undefined`, meaning all orders.
  - Anyone else gets `orderService.ownOrderIds(authContext.id)`.
- `isDelivered` (internal): true only when the fulfillment order's status is `closed`, it has at least one shipment, and every shipment has status `'delivered'`.

## Relationships
- `@kernel/permissions` and `@kernel/ability`: `callerForSubject` and `heldRules` check whether the caller holds `display:Order`.
- `@modules/orders` (`orderService`): supplies `ownOrderIds` and `orderBriefsByIds`. The briefs provide the buyer and payment data.
- `../repository`: `fulfillmentOrderRepository` (`searchBoard`, `summarizeProducts`) and `shipmentRepository` (`findByFulfillmentOrderIds`). It also provides the `BoardFilters` type.
- `../presenter`: shapes the output rows and summaries.
- `../model`: provides the `FulfillmentOrderDocument` type.
- `@infrastructure/persistence/search`: `normalizePagination` and `buildPaginatedMeta` handle paging.
- `@types`: provides `AuthContext`, the preorder DTO types and the `FulfillmentOrderStatus` enum.

## Notes
- Authorization is enforced in the query, not by the route. The route only checks `read:Order`, which every signed-in account holds. Staff with `display:Order` see all rows. Others see only their own orders.
- `now` is injectable so tests can control the `late` and `dueWithin` measurements.
- Shipments are fetched for the whole page, then matched to each fulfillment order in memory by id.
