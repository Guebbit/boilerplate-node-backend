---
source: src/modules/returns/services/withdraw.ts
sha256: 4bc31c0c6df11af18c747593468ee30b31ae0e2682d940542ef272b24de4d55c
generated_at: 2026-11-14T21:41:50.605470+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/withdraw.ts

## Purpose

Implements the buyer's Art. 11a withdrawal before dispatch: cancels the order (full refund, stock release), writes a `Return` document closed at birth as the dated proof of withdrawal, and enqueues the acknowledgement outbox events. When the shop has already started on made-to-order goods, it cancels only the eligible shipment groups instead. A single transaction guarantees the cancel and the record land atomically.

## Key elements

- **`withdrawBeforeDispatch`** (export) — Entry point. Routes to a full cancel (`cancelAndRecord`) or a partial cancel of eligible groups (`withdrawEligibleGroups`) based on whether the shop has started on excluded items. Handles the race fallback: if the cancel is refused because a shipment landed, re-reads the order and delegates to the injected `openAsReturn` to open a goods return instead.
- **`cancelAndRecord`** — The single `withTransaction` block: locks the order row, calls `orderService.withdrawWithin` to cancel, writes the `Return` row via `returnRepository.create`, enqueues the requested and closed outbox events, and returns the after-commit `settle` callback.
- **`withdrawalRow`** — Builds the `ReturnDocument` partial: status `closed`, reason `withdrawal`, empty `lines`, `refundAmount` from `refundOwedOn`, `returnPostage` from `returnPostagePayer()`, and the opener's `statedVia`/`requestedAt`/`staffId`.
- **`refundOwedOn`** — Returns the full order total if `paidAt` is set, otherwise a zero amount in the order's currency.
- **`withdrawEligibleGroups`** — Partial-withdrawal path: queries `deliveryService.remainderOptions`, filters out groups containing made-to-order items (`isExcludedFromWithdrawal`), then sequentially calls `createCancellation` for each eligible group. Stops on first refusal.
- **`missingKeyOf`** — Returns the first missing permission (`create:Refund` or `update:Order`) for a staff caller, or `undefined` if both are held.
- **`Withdrawn`** — Discriminated union type for the transaction result: either a `ResponseReject` (cancel refused) or the created `ReturnDocument` plus the `settle` callback.

## Relationships

- **`src/modules/orders/index.ts`** — imports `hasShopStarted`, `orderService`, `orderTotal`, `isBeforeDispatch`, `isExcludedFromWithdrawal`, and the `OrderDocument` type; calls `orderService.withdrawWithin` inside the transaction.
- **`src/modules/orders/domain/withdrawal.ts`** — provides the domain logic for the withdrawal/cancel operation invoked through `orderService`.
- **`src/modules/orders/domain/lifecycle.ts`** — source of `hasShopStarted` and `isBeforeDispatch` used to route between the full-cancel and partial-cancel paths.
- **`src/modules/orders/domain/totals.ts`** — source of `orderTotal`, used by `refundOwedOn` to compute the refund amount.
- **`src/modules/orders/services/index.ts`** — the service layer that exposes `orderService.withdrawWithin` to this file.
- **`src/modules/orders/model.ts`** — defines the `OrderDocument` type used throughout.
- **`src/modules/delivery/index.ts`** — exposes `deliveryService`, which this file calls (`remainderOptions`) to enumerate live shipment groups for the partial-withdrawal path.
- **`src/modules/delivery/services/index.ts`** — the delivery service implementation backing `remainderOptions`.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — exercises the delivery-service interaction that `withdrawEligibleGroups` depends on.
- **`src/infrastructure/runtime/database.ts`** — provides `withTransaction`, which wraps the cancel + record for atomicity.
- **`src/kernel/outbox.ts`** — provides `nudgeOutbox`, called after a successful commit to flush enqueued events.
- **`src/kernel/permissions.ts`** — provides `callerForSubject`, used by `missingKeyOf` to resolve the staff caller's subject.
- **`src/kernel/ability.ts`** — provides `holds`, used to check `create:Refund` / `update:Order` permissions.
- **`src/domain-primitives/money.ts`** — provides `padDecimal` for the zero-refund case.
- **`src/infrastructure/http/response.ts`** — provides the `ResponseReject` type used in the refused-cancel branch.

## Notes

- **Atomicity contract:** the transaction guarantees that a canceled order always has its dated `Return` record, and vice versa. A crash between the two leaves neither.
- **Race with a shipment:** if a shipment lands between the pre-check and the cancel, `withdrawWithin` refuses. The code then re-reads the order via `openableOrder`; if it is no longer before dispatch, it delegates to `openAsReturn` (a goods return) rather than retrying the cancel. This fallback applies to staff callers too, not just the buyer.
- **Sequential group cancels:** `withdrawEligibleGroups` loops one group at a time because each `createCancellation` acquires the order's lock row; parallel calls would deadlock.
- **`statedVia` is optional:** the field is conditionally spread into the row and cancellation inputs, so it is absent from the document when the buyer did not specify a channel.
- **Outbox events:** a withdrawal emits `return.requested` + `return.closed` (not `return-closed` for goods-returned). The refund's own `order-refunded` mail is a separate event triggered by the payment sweep when `settle()` runs.
- **Staff permissions are checked before the transaction:** if either `create:Refund` or `update:Order` is missing, the function short-circuits with a `forbidden` outcome and no DB work occurs.
