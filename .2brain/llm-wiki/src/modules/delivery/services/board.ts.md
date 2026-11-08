---
source: src/modules/delivery/services/board.ts
sha256: af293af48894cf9af910caf442a454e2408d177c84680cd4f7f829063361b496
generated_at: 2026-11-08T05:34:05.529296+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/board.ts

## Purpose

Provides the two read operations behind the admin preorder board (ADMIN_SALES 3): a paginated list of fulfillment orders with their buyer and payment details, and a paginated per-product unit-count summary. The `delivery` module owns the relevant dates, consent state, and hold logic, making it the authoritative source for these queries; buyer and payment data are fetched in one batched call into `orders`.

## Key elements

- **`BoardQuery`** (exported interface) — the list-route query shape: optional `cause`, `state`, `productId`, `late`, `dueWithin`, plus standard pagination fields.
- **`readableOrders`** (internal) — resolves the caller's read scope. Staff holding `display:Order` get `undefined` (all rows); others get their own order IDs; a caller with no ID gets an empty array (no rows).
- **`isDelivered`** (internal) — returns `true` only when the fulfillment order is `closed` and every associated shipment has status `'delivered'`.
- **`listPreorderFulfillmentOrders`** (exported) — main board query. Applies scope, fetches a page from `fulfillmentOrderRepository.searchBoard`, then batch-fetches order briefs and shipments in parallel, and maps each row through the presenter. Accepts an injectable `now` for time-relative filters (`late`, `dueWithin`).
- **`summarizePreorders`** (exported) — per-product unit counts. Applies the same scope and an optional `productId` filter, queries `fulfillmentOrderRepository.summarizeProducts`, and maps rows through the presenter.

## Relationships

- **`@infrastructure/persistence/search`** — imports `normalizePagination`, `buildPaginatedMeta`, and the `PaginationInput` / `PaginatedMeta` types for page handling.
- **`@kernel/permissions`** — calls `callerForSubject` to derive the caller's identity for the ability check.
- **`@kernel/ability`** — calls `heldRules` to test whether the caller holds `display:Order`.
- **`@modules/orders`** — calls `orderService.ownOrderIds` (scoped path) and `orderService.orderBriefsByIds` (batched buyer/payment read).
- **`../repository`** — uses `fulfillmentOrderRepository.searchBoard` and `.summarizeProducts` for the primary data, `shipmentRepository.findByFulfillmentOrderIds` for delivery status, and the `BoardFilters` type.
- **`../model`** — imports the `FulfillmentOrderDocument` shape returned by the repository.
- **`../presenter`** — maps raw documents to the API-facing `PreorderFulfillmentOrder` and `PreorderProductSummary` via `presentPreorderFulfillmentOrder` and `presentProductSummary`.
- **`@types`** — imports `AuthContext`, `ListPreorderFulfillmentOrdersCause`, `PreorderFulfillmentOrder`, `PreorderFulfillmentState`, `PreorderProductSummary`, and `FulfillmentOrderStatus`.
- **`tests/contract/ownership-shop.contract.test.ts`** — exercises the scope and permission behaviour of these exports.

## Notes

- **Scope is query-level, not route-level.** The route permission `read:Order` is held by every signed-in account, so row visibility is enforced entirely inside `readableOrders` via the `display:Order` ability.
- **`readableOrders` tri-state return:** `undefined` = "no filter" (all rows), `string[]` = restrict to those IDs, `[]` = caller can see nothing. Callers must spread it conditionally (`...(orderIds ? { orderIds } : {})`) to avoid an empty-array filter leaking into the query.
- **Time injection:** both exported functions accept a `now: Date` parameter (defaults to `new Date()`) so that `late` / `dueWithin` filters are deterministic in tests.
- **Delivery check is strict:** `isDelivered` requires the fulfillment order to be *closed* **and** at least one shipment to exist **and** every shipment to be `delivered`. A closed order with zero shipments is not "delivered."
