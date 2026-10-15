---
source: src/modules/orders/tests/unit/status-traits.test.ts
sha256: ae0ee5546e986f806e3089d5a536686e3f2d8411bd33e83cc656ea74a541ef03
generated_at: 2026-10-15T11:21:19.374935+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/status-traits.test.ts

## Purpose

Unit tests for the order-status traits record and the `statusesWhere` predicate. They verify that `ORDER_STATUS_TRAITS` covers every `OrderStatus` value with the correct boolean traits, and that `statusesWhere` returns matching statuses in contract (enum declaration) order.

## Key elements

- **`describe('ORDER_STATUS_TRAITS')`** — two assertions:
  - *Completeness check*: keys of the record (sorted) must equal all `OrderStatus` values (sorted), guaranteeing one row per status.
  - *Trait-value table* (`it.each`): pins `stockCommitted`, `beforeDispatch`, and `withdrawable` for each of the six statuses via `toMatchObject` (allows additional fields).
- **`describe('statusesWhere')`** — asserts that filtering on `traits.fulfillment.followsSummary` returns exactly `[paid, processing]` in that order.

## Relationships

- **`src/modules/orders/domain/status-traits.ts`** — source of the two symbols under test (`ORDER_STATUS_TRAITS`, `statusesWhere`); imported via the domain barrel.
- **`src/modules/orders/domain/index.ts`** — the barrel re-export this file imports from (`../../domain`).
- **`src/types/index.ts`** — provides the `OrderStatus` enum used as the reference set for completeness and as the parameter type in the trait table.

## Notes

- The trait table uses `toMatchObject`, so additional fields on each row (e.g. the nested `fulfillment` object exercised in the `statusesWhere` test) are intentionally left unchecked here.
- The `statusesWhere` test hard-codes the expected subset `[paid, processing]`; if `followsSummary` is added to more statuses, this assertion must be updated in lockstep.
- Both the completeness check and the `statusesWhere` assertion rely on **contract order** (enum declaration order), not alphabetical order — `.toSorted()` is used only to make the completeness comparison order-independent.
