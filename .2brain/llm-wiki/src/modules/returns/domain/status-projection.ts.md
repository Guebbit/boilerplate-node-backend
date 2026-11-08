---
source: src/modules/returns/domain/status-projection.ts
sha256: 252b93cca8ff282393834220b978fd4508d3340675e6d700f737deaa204b830d
generated_at: 2026-11-08T07:58:59.609664+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/domain/status-projection.ts

## Purpose

Computes the single projected return status displayed beside an order's own status. It is a pure function over a collection of returns, so every status boundary is testable without a database or external state.

## Key elements

- **`ProjectedReturn`** (interface) — the minimal shape of a return as the projection sees it: `status`, `kind`, optional `remedy`, and `lines` (product/quantity pairs).
- **`ProjectedReturnStatus`** (type) — the output domain: `Exclude<OrderReturnStatus, 'none'> | undefined`. `undefined` means the order carries no return stamp at all.
- **`projectReturnStatus(returns, ordered)`** (function, the sole logic export) — returns `'requested'`, `'in_progress'`, `'returned'`, `'partially_returned'`, or `undefined` based on priority: pending-staff requests first, then approved-but-awaiting, and finally a full/partial quantity check.

## Relationships

- **`./lifecycle`** — imports `QUANTITY_HOLDING_RETURN_STATUSES` (which statuses still "hold" goods) and `handsUnitsBack` (remedy check), plus the `ReturnKind`, `ReturnRemedy`, and `ReturnStatus` types used by `ProjectedReturn`.
- **`./quantities`** — imports `quantitiesByProduct` to aggregate line quantities per product for the full-vs-partial comparison.
- **`@types`** — imports `OrderReturnStatus` to ground the `ProjectedReturnStatus` union in the shared order-status vocabulary.
- **`./index`** — re-exports this module so callers can import from the domain barrel.
- **`services/projection.ts`** — the application-layer service that calls `projectReturnStatus` with real data.
- **`tests/unit/status-projection.test.ts`** — unit tests exercising every branch of the priority and quantity logic.
- **`delivery/tests/unit/fulfillment.test.ts`** — exercises this module indirectly through fulfillment integration scenarios.

## Notes

- `undefined` is the sentinel for "no return status at all" (not `'none'`); treat it as the absence of a stamp, not a distinct state.
- The `ordered` map must already be netted of remainder-cancel units. Passing the raw order quantity will make a remainder-cancel order permanently read `'partially_returned'`.
- Only returns with `kind === 'return'`, at least one line, a quantity-holding status, and a remedy that does *not* hand units back are considered "holding." Cancellations, declines, lineless returns, and replacement/repair remedies are all invisible to the result.
