---
source: src/modules/inventory/services/returns.ts
sha256: bff109e0051a8490812f1327636275d7d83fde875df84df2966f4ff22e35ccb9
generated_at: 2026-10-15T10:36:23.597344+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/returns.ts

## Purpose

Thin service that records customer returns as `restock` inventory-movement ledger entries. It deliberately performs no reservation or state transition itself — the caller's transaction and the return document's own `approved → received` transition guarantee at-most-once execution.

## Key elements

- **`restockReturnedLines(lines, context, session?)`** — Sole export. Iterates over returned order lines and creates one `restock` ledger entry per line (delegating to `applyToEveryLine`). `context.reference` names the original order; `context.note` names the return record. Throws on the first line whose counters refuse the restock, leaving the caller's transaction to roll back.

## Relationships

- **`./transition`** — Imports `applyToEveryLine`, which performs the per-line ledger write and cache invalidation. This file adds no logic beyond choosing `StockMovementReason.restock` and passing through the caller's Mongoose `ClientSession`.
- **`@types` (`src/types/index.ts`)** — Imports the `StockMovementReason` enum to tag each movement as `restock`.
- **`./index.ts`** — Barrel re-export; consumers of the inventory service import `restockReturnedLines` through the module root rather than this path directly.
- **`tests/integration/cache-invalidation.test.ts`** — Integration tests exercise this function (via the transition layer) to verify that stock caches are invalidated when a return is restocked.

## Notes

- **Caller owns atomicity.** The function accepts an optional `ClientSession` but never begins a transaction itself. The caller must wrap this call and the return-state transition in a single transaction so that a refused line rolls back *all* lines.
- **No idempotency key here.** At-most-once safety comes from the return document's own state machine (`approved → received`), not from any dedup logic in this file.
- **No reservation interaction.** The order's original stock hold remains in `shipped` state; this function only *adds* units back via a new ledger entry.
