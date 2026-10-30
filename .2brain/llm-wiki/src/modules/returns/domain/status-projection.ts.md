---
source: src/modules/returns/domain/status-projection.ts
sha256: b557025b3169f6a7b53cc24f8f68ac3a23ab94409bddaf50e677f41a9354e846
generated_at: 2026-10-29T05:38:37.676934+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/domain/status-projection.ts

## Purpose

Pure function that collapses an order's collection of returns into a single `OrderReturnStatus` word (the value `orders` displays beside its own status). It exists so the "what state are we in?" question is answerable and unit-testable without a database or service layer.

## Key elements

- **`ProjectedReturn`** — read-only shape the projection expects per return item: `status`, `kind`, optional `remedy`, and `lines` (product + quantity pairs).
- **`ProjectedReturnStatus`** — the return type: every `OrderReturnStatus` except `'none'`, or `undefined` (meaning no return to report).
- **`projectReturnStatus(returns, ordered)`** — the sole exported logic. Filters to *quantity-holding* returns (kind `'return'`, non-empty lines, a holding status, not a remedy that hands units back), then applies a priority ladder:
  1. Any in `'requested'` → `'requested'`
  2. Any in `'approved'` → `'in_progress'`
  3. Otherwise compares per-product returned quantities against `ordered` → `'returned'` or `'partially_returned'`
  4. No holding returns at all → `undefined`

## Relationships

- **`./lifecycle`** — supplies `QUANTITY_HOLDING_RETURN_STATUSES`, `handsUnitsBack`, and the `ReturnKind` / `ReturnRemedy` / `ReturnStatus` types used to filter holding returns.
- **`./quantities`** — supplies `quantitiesByProduct`, which sums `lines` into a `Map<productId, number>` for the coverage check.
- **`@types` (`src/types/index.ts`)** — source of the `OrderReturnStatus` union that `ProjectedReturnStatus` is derived from.
- **`src/modules/returns/domain/index.ts`** — barrel that re-exports this module's public API.
- **`src/modules/returns/services/projection.ts`** — service-layer consumer that calls `projectReturnStatus` as part of building the order's projected status.
- **`src/modules/returns/tests/unit/status-projection.test.ts`** — dedicated unit tests for `projectReturnStatus`.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — integration-adjacent test that exercises the projected status in a delivery/fulfillment context.

## Notes

- **`ordered` is "remaining to return," not "original order size."** The docblock clarifies that a remainder-cancel already subtracts cancelled units, so a cancelled unit never blocks the order from reading `'returned'`. Passing raw order quantities would be a bug.
- **`cancellation` returns and line-less returns are silently excluded** from `holding`; they can never push the status past `undefined`. This is intentional, not an edge case to guard against at call sites.
- **Remedy check via `handsUnitsBack`** — a `replacement` or `repair` hands units back to the buyer, so those returns are *not* quantity-holding and don't count toward coverage.
- The function is pure and synchronous; no side effects, no I/O, no memoization. Safe to call in hot paths.
