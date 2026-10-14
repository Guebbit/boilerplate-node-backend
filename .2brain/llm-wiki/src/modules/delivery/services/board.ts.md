---
source: src/modules/delivery/services/board.ts
sha256: 10f62dbe4e17d2cd42918c2e258bdd8f9bc9e4753f7f489f0424467f7891897f
generated_at: 2026-10-14T15:27:10.335581+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/board.ts

## Purpose

Read-side service for the admin preorder board (ADMIN_SALES 3). It answers two questions for a given page: "which preorder fulfillment orders match these filters, with buyer and payment attached?" and "what are the per-product unit counts?" Because `delivery` owns the dates, consent state, and hold, it is the module that can answer; buyer details and `paidAt` are fetched from `orders` in one batched read per page.

## Key elements

- **`BoardQuery`** (interface, exported) — the list-route input: standard pagination fields plus optional filters `preorder`, `state`, `productId`, `late`, `dueWithin`.
- **`readableOrders`** (private) — resolves the caller's read scope. Staff holding `orders.any.read` → `undefined` (all rows); everyone else → their own order IDs; no auth context → empty list.
- **`isDelivered`** (private) — true when a fulfillment order is `closed` **and** has at least one shipment **and** every shipment has status `'delivered'`.
- **`listPreorderFulfillmentOrders`** (exported) — paginated board listing. Applies filters, fetches fulfillment orders from the repository, then batch-fetches order briefs and shipments in parallel. Returns presented items + pagination meta.
- **`summarizePreorders`** (exported) — paginated per-product unit counts, same scoping logic, no shipment join.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/ability.ts` | `heldKeys` checks whether the caller's subject carries `orders.any.read`. |
| `src/kernel/permissions.ts` | `callerForSubject` derives the ability subject from the `AuthContext`. |
| `src/modules/orders/index.ts` | `orderBriefsByIds` (batch buyer/payment briefs) and `ownOrderIds` (scope for non-staff). |
| `src/infrastructure/persistence/search.ts` | `normalizePagination`, `buildPaginatedMeta`, and the `PaginationInput` / `PaginatedMeta` types. |
| `src/modules/delivery/repository.ts` | `fulfillmentOrderRepository.searchBoard` / `.summarizeProducts` and `shipmentRepository.findByFulfillmentOrderIds`; also the `BoardFilters` type. |
| `src/modules/delivery/model.ts` | `FulfillmentOrderDocument` type used in `isDelivered`. |
| `src/modules/delivery/presenter.ts` | `presentPreorderFulfillmentOrder` and `presentProductSummary` shape the returned rows. |
| `src/types/index.ts` | `AuthContext`, `PreorderFulfillmentOrder`, `PreorderFulfillmentState`, `PreorderProductSummary`, `FulfillmentOrderStatus`. |
| `src/modules/delivery/controllers/get-preorder-fulfillment-orders.ts` | The route handler that calls `listPreorderFulfillmentOrders`. |
| `src/modules/delivery/services/index.ts` | Barrel that re-exports this module. |
| `src/modules/delivery/tests/integration/preorder-board.test.ts` | Integration tests exercising both exports with an injected `now`. |

## Notes

- **Scope is enforced in the query, not the route guard.** The `orders.any.read` key also matches a buyer's `self` key at the guard level, so the service itself must narrow rows via `orderIds` for non-staff callers.
- **`now` is an injectable parameter** (defaults to `new Date()`). Tests supply a fixed instant so `late` / `dueWithin` filters are deterministic.
- **`readableOrders` returns `undefined` to mean "no filter"** and an array to mean "restrict to these IDs." The spread `...(orderIds ? { orderIds } : {})` relies on this distinction.
- Order IDs are deduplicated with `new Set` before the batch `orderBriefsByIds` call.
- See `docs/modules/delivery.md#the-preorder-board` for the product-level rationale.
