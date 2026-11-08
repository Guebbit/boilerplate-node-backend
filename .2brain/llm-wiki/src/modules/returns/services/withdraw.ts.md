---
source: src/modules/returns/services/withdraw.ts
sha256: b91401dc5efbc9aa26fb7817468926bfe0717dc425cf052aa89a07e3ccad5938
generated_at: 2026-11-08T08:06:45.431402+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/withdraw.ts

## Purpose

Implements the buyer's right to withdraw an order **before dispatch** (Art. 11a). It composes two effects into one operation: the `orders` module's full cancellation (refunds in full, releases the stock hold) and a `Return` document written *closed at birth* with no lines (no goods are expected back), serving as the dated proof of the withdrawal. A second path handles the case where the shop has already started on made-to-order goods (Art. 16 exclusions): only eligible shipment groups are cancelled, one `kind: 'cancellation'` return per group.

## Key elements

- **`withdrawBeforeDispatch`** (exported) — Entry point. Decides between the full-cancel path and the eligible-groups path, checks staff permissions, invokes `orderService.withdrawById` / `withdrawOnBuyersBehalfById`, then either writes the withdrawal record or falls back to `openAsReturn` if a shipment landed in the race window.
- **`writeWithdrawalRecord`** (internal) — Inside a single transaction: creates the `ReturnDocument` (status `closed`, reason `withdrawal`, empty `lines`, full `refundAmount`), then enqueues `return.requested` → `return.closed` events in that order. After commit, nudges the outbox and calls `recordOpened`.
- **`refundOwedOn`** (internal) — Returns the order total if `paidAt` is set, otherwise a zero in the order's currency (via `padDecimal`).
- **`withdrawEligibleGroups`** (internal) — For started orders with Art. 16 exclusions: filters `deliveryService.remainderOptions` to groups with no excluded products, then calls `createCancellation` sequentially (each takes the order's lock row). Stops and returns the first failure.
- **`missingKeyOf`** (internal) — Determines which permission key (`create:Refund` or `update:Order`) a staff caller is missing, for a precise `forbidden` response.

## Relationships

- **`@modules/orders`** (barrel) — Consumes `hasShopStarted`, `isBeforeDispatch`, `isExcludedFromWithdrawal`, `orderTotal`, `orderService`, and the `OrderDocument` type. The cancel/refund work is delegated to `orderService.withdrawById` / `withdrawOnBuyersBehalfById`.
- **`@modules/delivery`** — Calls `deliveryService.remainderOptions` to enumerate live shipment groups for the eligible-groups path.
- **`@kernel/outbox`** — Calls `nudgeOutbox()` after the transaction to flush the enqueued `return.requested` / `return.closed` events.
- **`@kernel/permissions` / `@kernel/ability`** — Resolves the caller's subject and checks `create:Refund` / `update:Order` holds for staff-initiated withdrawals.
- **`@infrastructure/runtime/database`** — Wraps the record-write + event-enqueue in `withTransaction`.
- **`@domain-primitives/money`** — Uses `padDecimal` to format the zero refund for unpaid orders.
- **`../repository`** — Persists the `ReturnDocument` via `returnRepository.create`.
- **`./cancel-remainder`** — Calls `createCancellation` per eligible shipment group.
- **`./ownership`** — Calls `openableOrder` to re-read the order in the race fallback.
- **`./outcome`** — Reuses the shared `CreateReturnOutcome` shape and helpers (`forbidden`, `nothingToCancel`, `opened`, `recordOpened`, `enqueueRequested`, `enqueueClosed`).
- **`@modules/returns/model`** — Imports the `ReturnDocument` type.

## Notes

- **Closed-at-birth pattern:** The `Return` is created already in `status: 'closed'` with `decidedAt` and `closedAt` set to the same instant. It is never "open" in the lifecycle sense; the two outbox events (`requested` → `closed`) are written atomically inside the same transaction as the row.
- **Race handling:** If a shipment completes between the `isBeforeDispatch` read and the cancel, the cancel fails. `withdrawBeforeDispatch` then re-reads the order via `openableOrder` and delegates to the caller-supplied `openAsReturn` callback — turning the withdrawal into a goods return rather than a full refund.
- **Sequential cancels:** `withdrawEligibleGroups` cancels groups one at a time in a `for` loop because each cancel acquires the order's lock row; they must not run in parallel.
- **Staff vs. buyer:** `opener.staffId === undefined` means the buyer acted themselves; otherwise a staff member is recording a buyer's verbal/written statement. The `statedVia` and `requestedAt` fields capture the channel and date the buyer stated the withdrawal.
- **`returnPostagePayer()`** (from `@modules/shop`) determines the postage responsibility recorded on the withdrawal row, even though no physical goods are expected back.
