---
source: src/modules/shop-tasks/services/work-summary.ts
source_sha256: a0a9ca3f29344df33e4314433667275efa938a491fc0ae36a9b236753b2b2312
context_sha256: e9d499c4d3a414fd0319aeb330bdfb47051b88d6b72209d37c9346e18c3aee06
generated_at: 2026-11-22T07:43:50.100113+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop-tasks/services/work-summary.ts

## Purpose
Computes the counts shown on staff navigation badges (open work waiting on each screen). Each count is read through the owning module's own list service as the caller, so a badge and its screen cannot disagree. Only badges for screens the caller may open are included.

## Key elements
- `workSummary(caller)` — the sole export. Filters `BADGES` to those whose `opens(caller)` is true, runs all counts in parallel, and returns the result as a `ShopWorkSummary` object (via `Object.fromEntries`). Zero counts are kept as `0`; unpermitted keys are omitted.
- `Badge` (internal interface) — `{ key, opens, count }`: the `ShopWorkSummary` key, a permission check, and an async count.
- `mayOpen(action, subject)` — builds the `opens` check using `holds(callerForSubject(caller, subject), action, subject)`. It mirrors the screen's route gate, e.g. `display:Order` by name, which plain `read:Order` (held by every signed-in account) does not satisfy.
- `ONE_ROW` / `totalOf` — request `pageSize: 1` and read `meta.totalItems`, so only the total is fetched.
- `BADGES` — five badges in navigation order:
  - `salesOrders`: needs `display:Order`; `orderService.search` with `fulfillmentStatus: 'awaiting_shipment'`, `deleted: false`, scoped by `orderService.callerScope(caller)`.
  - `salesPayments`: needs `display:Payment`; length of `paymentService.listAttention()` items.
  - `returns`: needs `read:Return`; `returnService.listReturns` with `status: 'requested'`.
  - `salesPreorders`: needs `display:Order`; `deliveryService.listPreorderFulfillmentOrders` with `late: true`.
  - `inventory`: needs `read:StockLevel`; `inventoryService.listLevels` with `lowOnly: true`.

## Relationships
- `src/kernel/ability.ts` (`holds`) and `src/kernel/permissions.ts` (`callerForSubject`, `ActionOn`, `PermissionSubject`) provide the permission checks.
- `@types` supplies `AuthContext` and `ShopWorkSummary` (`src/types/auth-context.ts` is a neighbor).
- Calls the `orderService`, `paymentService`, `returnService`, `deliveryService` and `inventoryService` exported from the `orders`, `payments`, `returns`, `delivery` and `inventory` module indexes (`src/modules/orders/index.ts`, `src/modules/payments/index.ts`, `src/modules/returns/index.ts`, `src/modules/delivery/index.ts`, `src/modules/inventory/index.ts`).
- Consumed by `src/modules/shop-tasks/controllers/get-shop-work-summary.ts`, with `src/modules/shop-tasks/services/index.ts` as the service barrel.

## Notes
- `orderService.search` is intentionally called without a third argument. Passing a caller context there would fire an `orders_viewed` analytics event, and a badge refresh is not a person viewing orders.
- `salesPayments` is the only count not taken from `meta.totalItems`; it counts the items returned by `listAttention()`.
- The `ShopWorkSummary` cast is needed because `Object.fromEntries` types its keys as `string`.
