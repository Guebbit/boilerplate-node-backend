---
source: src/modules/orders/domain/deletion.ts
sha256: d659a128267f827f51c71d2c452dc08ecf23980bba122d927631a9a5882133c1
generated_at: 2026-11-08T06:48:10.617727+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/deletion.ts

## Purpose

Defines the two pure predicates that determine whether an order may be soft-deleted (hidden) or hard-deleted (destroyed). Centralizing these rules here ensures the UI "delete door" and the service-layer actions agree on the same criteria and cannot diverge.

## Key elements

- **`DeletionCandidate`** – Minimal structural interface (`status`, `paidAt`, `moneyReceivedAt`) that any caller can satisfy; keeps the predicates decoupled from the full `Order` type.
- **`softDeletable(order)`** – Returns `true` only when `order.status === OrderStatus.canceled`.
- **`hardDeletable(order)`** – Returns `true` only when the order is canceled **and** has neither `paidAt` nor `moneyReceivedAt` set (guards against destroying records that an invoice or a late payment/refund still references).

## Relationships

- **`src/types/index.ts`** – Provides the `OrderStatus` enum used by both predicates.
- **`src/modules/orders/domain/index.ts`** – Barrel file; re-exports this module so consumers import from the domain root.
- **`src/modules/orders/services/actions.ts`** – `OrderActions.delete` / `hardDelete` call these predicates before performing the actual mutation.
- **`src/modules/orders/services/remove.ts`** – The "delete door" service; evaluates `softDeletable` / `hardDeletable` to gate user-facing delete requests.

## Notes

- Both functions are pure and take only `DeletionCandidate`, not the full order entity. This makes them trivially testable and lets any object with the three fields be checked without a DB round-trip.
- `paidAt` and `moneyReceivedAt` are typed `Date | null | undefined` (optional + nullable). The `!order.paidAt` check in `hardDeletable` therefore treats all three absent shapes identically.
- Hard delete is a strict subset of soft delete: every hard-deletable order is also soft-deletable, but not vice-versa.
