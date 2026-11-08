---
source: src/modules/inventory/services/returns.ts
sha256: 25cfd745185e11759d9f9f3eaf454adc95acb7b7c6bfea0aa6120c82ef8cbf61
generated_at: 2026-11-08T06:03:26.757414+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/returns.ts

## Purpose

Provides a single entry point for restocking goods that a customer returned and staff received. It creates `restock` ledger movements for each line and immediately re-allocates the returned units to waiting backorders, all within the caller's Mongoose transaction so the operation is atomic.

## Key elements

- **`restockReturnedLines(lines, context, session)`** — the sole export. Takes an array of `{ productId, quantity }` lines, a `{ reference, note }` context (order id and return name), and the caller's `ClientSession`. Returns `Promise<void>`. Internally it:
  1. Calls `applyToEveryLine` with `StockMovementReason.restock` to write one movement per line.
  2. Chains `allocateWithin` over the distinct product IDs so the restocked units are immediately offered to backorders.
- **At-most-once guarantee** — not enforced here; it relies on the caller performing the return's own `approved → received` transition in the same transaction. This file does not check or mutate return state.

## Relationships

- **`./transition`** — imports `applyToEveryLine`, which iterates over the lines and applies a stock-movement operation per line within the given session.
- **`./allocate`** — imports `allocateWithin`, called after restocking to serve backordered customers from the newly available units.
- **`@types`** — imports the `StockMovementReason` enum (uses `.restock`).
- **`./index.ts`** — barrel re-export; downstream consumers import `restockReturnedLines` through the services index.

## Notes

- The function **never throws a domain-specific error**; any failure surfaces as a generic `Error` from the counter logic inside `applyToEveryLine`. The caller is expected to let the transaction roll back.
- `allocateWithin` is called with **distinct product IDs only** (quantities are dropped). It presumably re-runs its own allocation logic across all backordered lines for those products.
- The caller is responsible for calling `refreshStockCacheForProducts` (see `./transition`) in the same session; this file does not touch caches.
- No reservation/hold is created or released here — the original order's hold remains in `shipped` state.
