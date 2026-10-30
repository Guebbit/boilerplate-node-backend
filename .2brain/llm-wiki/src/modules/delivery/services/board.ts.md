---
source: src/modules/delivery/services/board.ts
sha256: af293af48894cf9af910caf442a454e2408d177c84680cd4f7f829063361b496
generated_at: 2026-10-29T03:38:16.140432+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/board.ts

## Purpose

Implements the two read operations behind the admin preorder board (feature ADMIN_SALES 3): listing fulfillment orders (with buyer and payment context) and summarising per-product unit counts. It owns the date-based filters (`late`, `dueWithin`), the consent/hold state, and the delivery-arrived check; buyer identity and `paidAt` are pulled from the `orders` module in a single batched read per page.

## Key elements

- **`BoardQuery`** (exported interface) – the route-level input beyond pagination: optional `cause`, `state`, `productId`, `late`, `dueWithin`.
- **`readableOrders`** (private) – resolves the caller's row scope. Staff holding `display:Order` → `undefined` (all rows); otherwise → the caller's own order-ID list; missing `authContext` → empty array (no rows).
- **`isDelivered`** (private) – returns `true` only when the fulfillment order status is `closed`, it has at least one shipment, and every shipment's status is `'delivered'`.
- **`listPreorderFulfillmentOrders`** (exported) – main board query. Normalises pagination, applies filters + row scope, searches `fulfillmentOrderRepository.searchBoard`, batch-fetches order briefs and shipments via `Promise.all`, maps each row through `presentPreorderFulfillmentOrder`, and returns `{ items, meta }`.
- **`summarizePreorders`** (exported) – per-product unit-count page. Delegates to `fulfillmentOrderRepository.summarizeProducts` and maps rows through `presentProductSummary`.

## Relationships

- **`src/infrastructure/persistence/search.ts`** – imports `normalizePagination`, `buildPaginatedMeta`, and the `PaginationInput` / `PaginatedMeta` types to standardise paging.
- **`src/kernel/permissions.ts`** – `callerForSubject` builds the subject handle used for the permission check.
- **`src/kernel/ability.ts`** – `heldRules` is queried to test whether the caller holds `display:Order`.
- **`src/modules/orders/index.ts`** – `orderService` supplies `ownOrderIds` (row-scope narrowing) and `orderBriefsByIds` (buyer + `paidAt` enrichment).
- **`src/modules/delivery/repository.ts`** – `fulfillmentOrderRepository.searchBoard` / `.summarizeProducts` perform the data access; `shipmentRepository.findByFulfillmentOrderIds` fetches shipment statuses; `BoardFilters` is the shared filter type.
- **`src/modules/delivery/model.ts`** – `FulfillmentOrderDocument` is the row shape returned by the repository.
- **`src/modules/delivery/presenter.ts`** – `presentPreorderFulfillmentOrder` and `presentProductSummary` shape each row for the API response.
- **`src/types/index.ts`** – imports `AuthContext`, `FulfillmentOrderStatus`, `PreorderFulfillmentState`, `PreorderFulfillmentOrder`, `PreorderProductSummary`, and `ListPreorderFulfillmentOrdersCause`.
- **`src/modules/delivery/services/index.ts`** – barrel re-export; the two exported functions are surfaced here for route handlers.
- **`tests/contract/ownership-shop.contract.test.ts`** – exercises the ownership/scope behaviour of `readableOrders` (all-rows vs. own-only vs. empty).

## Notes

- **`undefined` vs. `[]` in `readableOrders`:** returning `undefined` means "no restriction – show all rows"; returning an array (even empty) restricts to those IDs. Callers spread `orderIds` into the filter only when it is defined. A missing `authContext` short-circuits to `[]` (zero rows), not `undefined`.
- **`now` parameter:** both exported functions accept an optional `now: Date` (defaulting to `new Date()`) so that tests can pin the instant used by `late` / `dueWithin` comparisons without mocking the clock.
- **`isDelivered` is a pure helper**, not part of the domain model; it is applied per-row during mapping, not stored.
- **Batch pattern:** order briefs and shipments are fetched in parallel after the main search, keyed by the distinct `orderId` / `_id` sets from the current page only (one extra round-trip per page, not per row).
