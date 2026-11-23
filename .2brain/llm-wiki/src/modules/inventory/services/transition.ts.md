---
source: src/modules/inventory/services/transition.ts
source_sha256: a876fdfd8cd38dcf2a3262353c1d9b9f4c17c96fb1acb1b838088eb13e538a0a
context_sha256: e2e1b653a7c5d8343c2feb0c3728ce7a934d3ecd104fb12d74620e3c49f5550d
generated_at: 2026-11-22T05:24:15.152584+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/services/transition.ts

## Purpose
The single chokepoint for stock changes in the inventory module. Every counter move and its matching ledger row (stock movement) go through `applyTransition`. Named transitions published by sibling services decide what may move. This file performs the guarded write and records it.

## Key elements
- **`applyTransition(reason, productId, quantity, context?, session?)`** moves one product's counters and records a stock movement, or does neither. It returns `true` if the counters moved and `false` if they refused.
  - If the product has no level row, `reserve`, `backorder` and `owed` return `false`.
  - If the product has no level row, every reason except `receive` and `adjust` returns `true` without writing anything ("nothing to move").
  - `receive` and `adjust` call `stockLevelRepository.insertIfAbsent` to create a row, then continue.
  - Next it computes the delta with `counterDeltaFor(reason, quantity, kind)` and applies it with `stockLevelRepository.applyDelta`.
  - On success it creates a `stockMovementRepository` row containing `productId`, `reason`, the delta fields and the recorded `reference`/`note`. If the write is refused, no row is written.
  - `context.kind` (a `HoldKind`, defaulting to `'stock'`) is not recorded on the row. It only decides which counter a `release`/`expire` gives back (`backordered` for a preorder claim).
- **`applyToEveryLine(reason, lines, context, session?)`** applies one transition per line, all or none. It throws an `Error` if a line's counters refuse, so the caller's transaction rolls back. It also throws up front for `ship` on a line with `kind === 'backorder'`, because those units are still a preorder claim.

## Relationships
- Imports `counterDeltaFor` and `HoldKind` from `../domain` (`src/modules/inventory/domain/index.ts`). The transition rules themselves live in `src/modules/inventory/domain/transitions.ts`.
- Reads and writes through `stockLevelRepository` and `stockMovementRepository` in `src/modules/inventory/repository.ts`.
- Calls `forgetAvailability` from `./availability` to drop the product's availability entry after a write.
- Uses `StockMovementReason` from `@types` (`src/types/index.ts`).
- Used by the sibling services `reserve.ts`, `allocate.ts`, `holds.ts`, `returns.ts`, `top-up.ts` and `admin.ts`, which publish the named transitions. The `@internal` tag says `applyTransition` never leaves the module barrel.
- `src/modules/delivery/tests/unit/fulfillment.test.ts` is related through the dependency graph.

## Notes
- **Session handling:** with a `session`, all reads and writes join the caller's transaction. In that case `applyTransition` does not call `forgetAvailability`. The delete cannot roll back, so the caller must run `forgetAvailabilityForOrder` after the transaction commits. Without a session, the entry is forgotten here.
- **Deleted products:** `release`/`expire`/`commit` against a missing level row return `true` on purpose. The level row is deleted with its product, so sweeps over an order's lines must keep going. This relies on `module.ts`'s `PRODUCT_DELETED` listener, per the source comment.
- **Level row read:** the level row is read first, and `insertIfAbsent` runs only when it is missing, so after a product's first transition the existing-row path skips the insert.
- **Error messages:** `applyToEveryLine` builds its refusal message from `context.note` when present, otherwise from `order <reference>`.
