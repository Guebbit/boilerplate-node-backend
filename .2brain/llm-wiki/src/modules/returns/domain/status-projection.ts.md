---
source: src/modules/returns/domain/status-projection.ts
sha256: 49d47103421e3134691c807414b7e99d96ed22f929a90582ea391c646cb9f98e
generated_at: 2026-10-15T11:53:10.353916+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/domain/status-projection.ts

## Purpose

Pure function that derives the single `orders`-visible return status (`requested`, `in_progress`, `returned`, `partially_returned`, or `undefined`) from a set of return records and the order's outstanding quantities. Exists to keep that derivation database-free and independently testable.

## Key elements

- **`ProjectedReturn`** — minimal read-model shape the function consumes: `status`, `kind`, and `lines` (product/quantity pairs).
- **`ProjectedReturnStatus`** — `Exclude<OrderReturnStatus, 'none'> | undefined`; `undefined` is the "no stamp" case.
- **`projectReturnStatus(returns, ordered)`** — the sole logic export. Filters to goods-holding returns (`kind === 'return'`, non-empty `lines`, status in `QUANTITY_HOLDING_RETURN_STATUSES`), then applies a priority ladder: any `requested` → `'requested'`; else any `approved` → `'in_progress'`; else compares per-product returned quantities against `ordered` to return `'returned'` or `'partially_returned'`. Returns `undefined` when no goods-holding return exists.

## Relationships

- **`./lifecycle`** — imports `QUANTITY_HOLDING_RETURN_STATUSES`, `ReturnKind`, and `ReturnStatus`; the status constants drive the "which statuses count as holding goods" filter.
- **`@types`** — imports `OrderReturnStatus` to type the return value.
- **`./index.ts`** — re-exports this module for consumers of the domain barrel.
- **`services/projection.ts`** — service-layer caller that assembles `ProjectedReturn[]` and `ordered` and invokes `projectReturnStatus`.
- **`tests/unit/status-projection.test.ts`** — unit tests covering each priority branch and the `undefined` path.
- **`delivery/tests/unit/fulfillment.test.ts`** — integration-adjacent test that exercises this projection indirectly through the delivery flow.

## Notes

- The `ordered` parameter already has remainder-cancel quantities subtracted by the caller; this function assumes a cancelled unit never ships and therefore never returns. Passing raw order quantities would cause a permanent `partially_returned` when a partial cancel occurs.
- Returns with `kind: 'cancellation'` or empty `lines` are silently excluded — they never influence the result regardless of their `status` field.
- The comparison is `>=`, so a return line with a quantity larger than the ordered amount still satisfies "returned" for that product.
