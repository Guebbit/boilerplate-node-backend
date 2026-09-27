---
source: src/modules/orders/services/status.ts
sha256: 3505b8cc7b9d55231b383695e8dc36f63fb75ab9f4d7ce20f4a39c8be0dedb6d
generated_at: 2026-09-27T15:16:27.698684+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/status.ts

## Purpose

The sole status writer for orders in the application. Other modules (`payments`, `delivery`) call these functions to *report* a fact they have already recorded; this file decides whether the move still applies (via the lifecycle table) and emits the resulting domain event. It is never the one recording the underlying fact.

## Key elements

- **`markSystemMove`** (private) — Shared helper. Derives `from` via `statusesLeadingTo(to, 'system')[0]`, performs a conditional update through `orderRepository.updateStatusIfIn`, and emits `ORDER_STATUS_CHANGED` on success. Returns `OrderDocument | null`.
- **`markPaid(orderId)`** — Reports payment settlement. Sole caller: `payments.settlePayment`.
- **`markProcessing(orderId)`** — Reports fulfilment start. Sole caller: `delivery`'s `POST /delivery/order/{id}/start`. (Admin override in `override.ts` writes this move directly, not via this function.)
- **`markShipped(orderId)`** — Reports carrier handover. Called by `delivery` after it has recorded the parcel handover.
- **`markDelivered(orderId)`** — Reports parcel arrival. Called by `delivery` after it has recorded the arrival.
- **`markFulfilled(orderId)`** — Reports digital-only fulfilment (`processing → delivered`). Deliberately **not** routed through `markSystemMove` because the lifecycle table allows only one `system` edge into `delivered` (the `shipped → delivered` edge); a second edge would corrupt `markDelivered`'s derived `from`.

## Relationships

- **`src/kernel/events.ts`** — Calls `emitDomainEvent` to broadcast `ORDER_STATUS_CHANGED` after a successful status write.
- **`src/modules/orders/domain/index.ts`** — Imports `statusesLeadingTo` to look up the permitted `from` status dynamically from `ORDER_LIFECYCLE`, keeping this file in sync with the table.
- **`src/modules/orders/events.ts`** — Imports the `ORDER_STATUS_CHANGED` event constant.
- **`src/modules/orders/repository.ts`** — Calls `orderRepository.updateStatusIfIn(orderId, [from], to)` for the conditional (optimistic) write.
- **`src/modules/orders/model.ts`** — Imports `OrderDocument` as the return type of every exported function.
- **`src/types/index.ts`** — Imports `OrderStatus` enum values used as arguments and literals.
- **`src/modules/orders/services/index.ts`** — Re-exports this module's public API.
- **`src/modules/orders/tests/integration/service-status.test.ts`** — Integration tests exercising these functions end-to-end.

## Notes

- **Conditional update, not blind set.** Every write goes through `updateStatusIfIn` with a single-element `from` array; concurrent duplicate reports (retry webhooks, rescanned parcels) resolve to `null` on the second call, so the event fires at most once.
- **`markFulfilled` is the exception.** It hard-codes `processing → delivered` and calls the repository directly. Adding `processing → delivered` to `ORDER_LIFECYCLE` would break `markDelivered`'s single-edge derivation — this constraint is deliberate and documented in `domain/lifecycle.ts`.
- **Caller discipline.** Each public function has exactly one intended caller module; the docblocks name it explicitly. There is no generic "set status to X" entry point by design.
- **Event emission is fire-and-forget** (`void emitDomainEvent(...)`); a failure in a subscriber does not roll back the status write.
