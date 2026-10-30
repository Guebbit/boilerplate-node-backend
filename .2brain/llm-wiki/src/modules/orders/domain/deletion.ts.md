---
source: src/modules/orders/domain/deletion.ts
sha256: 784b2dd03ad3092883eff20d53d645a261dbf3157f218919413d0e18407a0085
generated_at: 2026-10-29T04:39:33.908679+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/deletion.ts

## Purpose

Pure predicate functions that decide whether an order may be soft-deleted (hidden) or hard-deleted (destroyed). They exist so that the UI "delete door" and the service-layer `delete` / `hardDelete` actions share a single source of truth for eligibility, preventing the flag and the refusal from disagreeing.

## Key elements

- **`DeletionCandidate`** — Minimal interface (status, `paidAt`, `moneyReceivedAt`) that the predicates read. Callers pass only the slice they need; no full order object is required.
- **`softDeletable(order)`** — Returns `true` only when `status === OrderStatus.cancelled`.
- **`hardDeletable(order)`** — Returns `true` only when the order is cancelled **and** `paidAt` is absent **and** `moneyReceivedAt` is absent.

## Relationships

- **`src/types/index.ts`** — Provides `OrderStatus` (imported via the `@types` alias).
- **`src/modules/orders/domain/index.ts`** — Barrel re-export; this file's public API is surfaced through it.
- **`src/modules/orders/services/actions.ts`** — `OrderActions.delete` / `hardDelete` call these predicates before acting.
- **`src/modules/orders/services/remove.ts`** — The "delete door" UI/service layer uses the same predicates to gate the user-facing action.

## Notes

- Both functions are **pure** and side-effect-free; they read only the three fields on `DeletionCandidate`.
- `paidAt` and `moneyReceivedAt` are typed `Date | null | undefined`. The `hardDeletable` check uses `!order.paidAt` / `!order.moneyReceivedAt`, so both `null` and `undefined` are treated as "not set."
- Soft-delete is strictly a subset check on status; hard-delete adds the two financial-history guards. An order can be soft-deletable but **not** hard-deletable (e.g. cancelled but already paid).
