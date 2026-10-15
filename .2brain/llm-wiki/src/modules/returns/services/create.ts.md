---
source: src/modules/returns/services/create.ts
sha256: c699b6ddabc34a9550b3f75e825d2890d71a0fc4c4b497c16db4bc5aa4230533
generated_at: 2026-10-15T11:56:11.499358+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/create.ts

## Purpose

Single entry point for opening a return. It also serves as the "withdrawal button" handler: the same call branches on whether goods have been dispatched. Pre-dispatch it cancels the order, refunds in full, and writes a `Return` closed at birth (no lines). Post-dispatch it writes an open `Return` with the lines coming back and delegates the unshipped remainder to a separate cancellation.

## Key elements

- **`refundOwedOn(order)`** – Returns the full order total if the order was paid; `0` otherwise.
- **`writeWithdrawalRecord(order, context)`** – Inside a transaction: creates a `Return` with `status: 'closed'`, empty lines, the refund amount, and the Art. 11a postage payer. Enqueues `return.requested` then `RETURN_CLOSED` outbox events. After commit: nudges the outbox and records the audit trail.
- **`withdrawBeforeDispatch(order, input, authContext, context)`** – Calls `orderService.cancelById` with `{ withdrawal: true }`. On success, writes the withdrawal record and sends the acknowledgement mail. On cancel failure (e.g. a shipment landed in between), re-reads the order and falls through to `openReturn` if it is no longer before-dispatch.
- **`alreadyReturned(orderId, session)`** – Queries existing returns under the session, filters to those that hold returned goods, and flattens their lines into `ProductQuantity[]` for quantity checks.
- **`appendOpened(created, session)`** – Appends `return_requested` (and `return_approved` when the status is already `approved`) to the order timeline within the same transaction.
- **`writeReturn(order, input, lines, session)`** – Creates the `Return` document with resolved lines (title, unit price pulled from the order), initial status, and optional `decidedAt` for withdrawals. Enqueues `return.requested` and appends timeline events.
- **`openUnderLock(order, input, shipped)`** – The core post-dispatch path. Acquires the order's lock row, reads already-returned quantities, validates requested lines via `checkRequestedLines` against `returnableQuantities(shipped, earlier)`, then writes the return — all in one transaction to prevent two parallel openings from both committing a full return.
- **`announceOpened(order, created, context)`** – Post-commit: records the audit trail, syncs the order's return projection, and sends the acknowledgement mail (withdrawal-specific or generic).
- **`CreateReturnInput` / `CreateReturnOutcome`** – Re-exported from `./outcome` for consumers.

## Relationships

- **`@modules/orders`** (`orderService`, `orderTotal`, `isBeforeDispatch`, `isExcludedFromWithdrawal`, `OrderDocument`) – Cancels the order (withdrawal path), appends timeline events, computes refund totals, and classifies the dispatch state.
- **`@modules/delivery`** (`shippedQuantities`) – Provides the per-product shipped quantities that bound what is returnable.
- **`@infrastructure/runtime/database`** (`withTransaction`) – Wraps all write paths (withdrawal record, return creation) in a MongoDB transaction.
- **`@kernel/outbox`** (`enqueueOutboxEvent`, `nudgeOutbox`) – Enqueues `RETURN_CLOSED` and `return.requested` domain events; nudges the relay after commit.
- **`@infrastructure/http/response`** (`generateReject`) – Produces structured HTTP error payloads for rejected outcomes.
- **`@infrastructure/i18n`** (`t`) – Translates customer-facing messages.
- **`../domain`** (`checkRequestedLines`, `returnableQuantities`, `initialStatusFor`, `wireLines`, `holdsReturnedGoods`, `ProductQuantity`) – Pure domain logic for quantity validation, status derivation, and line normalisation.
- **`./cancel-remainder`** (`createCancellation`) – Creates the `kind: 'cancellation'` record for unshipped units when a post-dispatch return is opened.
- **`./notify`** (`mailReturnNotice`) – Sends the Art. 11a withdrawal acknowledgement or the generic "return received" mail.
- **`./ownership`** (`ownOrder`) – Verifies the caller owns the order; also used to re-read a fresh order after a failed cancel.
- **`./projection`** (`syncReturnStatus`) – Updates the order's cached return status after the return is persisted.
- **`./outcome`** – Shared outcome discriminated-union types and factory helpers (`badLines`, `refused`, `recordOpened`, `windowClosed`, etc.).

## Notes

- **Withdrawal ≠ cancellation.** A withdrawal is a `Return` record (closed, no lines) layered on top of the order's own cancel. The refund is settled by the order's cancel path, not by the `Return` row; the row is the dated customer-facing proof.
- **Race guard.** If a shipment lands between the "before dispatch" read and the cancel, the cancel fails and the code re-reads the order. If it is now post-dispatch, it opens a normal return instead of a full refund. This is the `!cancelled.success` branch in `withdrawBeforeDispatch`.
- **Lock ordering.** `openUnderLock` calls `returnRepository.lockOrder` *before* reading already-returned lines, so two concurrent openings serialize on the same row and the second sees the first's lines. This is the explicit defence against snapshot-isolation double-commits.
- **Cancellations are not returns.** Lines on a `kind: 'cancellation'` record are excluded from `alreadyReturned` (via the `holdsReturnedGoods` filter) because those units never shipped and therefore can't be "coming back."
- **Post-commit vs. in-transaction.** Mail, `nudgeOutbox`, `syncReturnStatus`, and `recordOpened` (audit) all run *after* the transaction commits. The outbox events themselves (`return.requested`, `RETURN_CLOSED`) are enqueued *inside* the transaction so they are atomic with the write.
- **Non-null assertion in `writeReturn`.** `byProduct.get(productId)!` is safe only because `checkRequestedLines` is guaranteed to accept only products present on the order. If that invariant changes, the assertion will throw.
