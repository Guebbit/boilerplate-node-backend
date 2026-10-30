---
source: src/modules/returns/services/withdraw.ts
sha256: 514cea038fc5756f85f8a99b95304b63e0506d80da16013e2b68ac91421ba78a
generated_at: 2026-10-29T05:45:25.015884+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/withdraw.ts

## Purpose

Implements the buyer's right of withdrawal (Art. 11a) before dispatch: it cancels the order, triggers a full refund, and writes a `Return` document that is closed at birth (no lines, since no goods are coming back) as the dated legal record. It also handles the partial-cancellation case where the shop has already started on made-to-order (Art. 16-excluded) items, and provides a race-safe fallback if a shipment lands between the "before dispatch" read and the cancel.

## Key elements

- **`withdrawBeforeDispatch`** (exported) — Entry point. Decides between the full-order path and the eligible-groups path, enforces staff permissions, invokes the order service cancel, and on success writes the withdrawal record. On a cancel failure (race with a shipment) re-reads the order and delegates to `openAsReturn`.
- **`writeWithdrawalRecord`** (internal) — Within a single DB transaction, creates a `ReturnDocument` (status `closed`, reason `withdrawal`, empty `lines`, full `refundAmount`) and enqueues `return.requested` then `return.closed` events. After commit, nudges the outbox and records the opened audit entry.
- **`withdrawEligibleGroups`** (internal) — For orders that are `processing` and contain Art. 16-excluded items: fetches shipment groups via `deliveryService.remainderOptions`, filters out groups containing excluded products, and sequentially calls `createCancellation` for each eligible group.
- **`refundOwedOn`** (internal) — Returns `orderTotal(order)` if the order has been paid, otherwise `0`.
- **`missingKeyOf`** (internal) — Checks the staff caller's ability to `create` a `Refund` and `update` an `Order`; returns the first missing permission key or `undefined`.

## Relationships

- **`@infrastructure/runtime/database`** — Wraps the record-write in `withTransaction` so the Return row and its outbox events commit atomically.
- **`@kernel/outbox`** — Calls `nudgeOutbox()` after the transaction to flush the queued `return.requested` / `return.closed` events.
- **`@kernel/permissions`** — Uses `callerForSubject` to build the permission subject for the `holds` checks.
- **`@kernel/ability`** — Calls `holds` to verify `create:Refund` and `update:Order` before allowing a staff-initiated cancel.
- **`@modules/delivery`** — Queries `deliveryService.remainderOptions` to enumerate shipment groups eligible for cancellation in the partial-withdrawal path.
- **`@modules/orders`** (barrel) — Consumes `orderService.withdrawById` / `withdrawOnBuyersBehalfById` (the actual cancel + refund), `orderTotal`, `hasShopStarted`, `isBeforeDispatch`, and `isExcludedFromWithdrawal`; imports the `OrderDocument` type.
- **`../repository`** — Calls `returnRepository.create` to persist the closed-at-birth Return document.
- **`../model`** — Imports the `ReturnDocument` type used as the return value of the record write.

## Notes

- **Race safety:** If the order service cancel fails (e.g., a shipment dispatched between the caller's read and the cancel), the function re-reads the order via `openableOrder` and, if it is no longer before dispatch, hands off to the `openAsReturn` callback so the buyer's request is processed as a normal return rather than a full refund of already-received goods.
- **Staff vs. buyer paths:** A staff member (`opener.staffId` defined) must hold both `create:Refund` and `update:Order`; the cancel runs under the operator's scope via `withdrawOnBuyersBehalfById`. A buyer simply calls `withdrawById`.
- **Closed-at-birth invariant:** The Return is created with `status: 'closed'`, `decidedAt === closedAt === now`, and an empty `lines` array. It is never in a pending state.
- **Postage:** `returnPostagePayer()` (from `@modules/shop`) is stored on the record, but no postage *line* is emitted because no goods are expected back.
