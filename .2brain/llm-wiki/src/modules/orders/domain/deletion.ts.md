---
source: src/modules/orders/domain/deletion.ts
source_sha256: d659a128267f827f51c71d2c452dc08ecf23980bba122d927631a9a5882133c1
context_sha256: c8464bab6b9ff68fd54384836ac3115bcb6c96f2abf65a906d4cd59372e8f723
generated_at: 2026-11-22T06:11:01.399161+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/domain/deletion.ts

## Purpose
Defines the pure rules for when an order may be deleted. Both the delete door and `OrderActions.delete` / `hardDelete` ask the same two questions through this file, so the flag and the refusal cannot disagree. Orders are financial records: soft delete (hiding) is only for finished, canceled orders; hard delete (destroying) is only for orders never paid and never handed money.

## Key elements
- `DeletionCandidate` — interface for the slice of an order the rules read: `status` (`OrderStatus`), optional `paidAt` (set once an invoice exists), optional `moneyReceivedAt` (money recorded after the order could no longer take it).
- `softDeletable(order)` — true only when `status === OrderStatus.canceled`.
- `hardDeletable(order)` — true only when the order is canceled, has no `paidAt`, and has no `moneyReceivedAt`. A paid order's invoice must survive, as must an order that a late payment and its refund point at.

## Relationships
- Imports `OrderStatus` from `@types` (`src/types/index.ts`).
- Consumed by the order delete logic in `src/modules/orders/services/actions.ts` and `src/modules/orders/services/remove.ts`, which use these predicates so the visible flag and the enforced refusal agree.
- Part of the orders domain module, alongside `src/modules/orders/domain/index.ts`.

## Notes
- Both functions are pure and take the order "as it is now"; callers must pass current state.
- Hard deletability is strictly narrower than soft deletability: every hard-deletable order is also soft-deletable.
