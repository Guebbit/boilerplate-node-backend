---
source: src/modules/returns/services/cancel-remainder.ts
sha256: dd7ee14874b1d5c38344e0f6e22f616b8194bb1085cf0a1b5094287275fc973b
generated_at: 2026-10-29T05:40:58.054190+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/cancel-remainder.ts

## Purpose

Implements cancellation of the **unshipped remainder** of a single fulfillment order. It creates a Return document of `kind: 'cancellation'` that is **closed at the moment of creation** (no open state). Within one transaction under the order's lock row it marks lines cancelled (via `delivery`), releases stock (via `inventory`), writes the closed Return row, and opens a refund record. After commit it nudges the outbox, refreshes caches, syncs the order's return-status projection, and fires the refund to the payment provider. The `returns` module owns this because it is the only module that already reaches delivery, inventory, payments, and the order lock together.

## Key elements

- **`createCancellation`** (exported) — Entry point (`POST /returns`, `kind: 'cancellation'`). Validates input, loads the order scoped to the caller, fetches remainder options from `deliveryService`, runs `refuseCaller`, then delegates to `cancelUnderLock` and `announceCancelled`.
- **`cancelUnderLock`** — The single `withTransaction` block: locks the order row, calls `deliveryService.cancelRemainder`, computes the refund breakdown, releases stock via `orderService.releaseStock` (distinguishing backorder vs. shelf units), writes the Return row, enqueues `requested` + `closed` outbox events, and opens the refund via `paymentService.openReturnRefund` when owed > 0.
- **`rowFor`** — Builds the `Partial<ReturnDocument>` for a cancellation: status `closed`, `decidedAt`/`closedAt` set to now, lines enriched with product title and unit price from the order, refund and shipping-refund amounts from the breakdown.
- **`refund`** — Post-commit: calls `paymentService.sendOpenedRefund` if a refund was opened; a refusal here is left to the payment sweep (the Return is already closed).
- **`announceCancelled`** — Post-commit side effects: `nudgeOutbox()`, audit record, `inventoryService.refreshStockCacheForProducts`, `syncReturnStatus`, then `refund`.
- **`refuseCaller`** — Pre-write eligibility: buyer must pass `reason: 'withdrawal'`; checks `cancelRefusalOf` for key / window / excluded lines; validates the buyer's statement via `checkStatement`. Key check (403) fires **before** statement validation so an unauthorised caller learns nothing else.
- **`Cancelled`** (local interface) — What the transaction decided: the created `ReturnDocument`, the cancelled `ProductQuantity[]` lines, and the opened refund (or `null`).

## Relationships

- **`@infrastructure/http/response`** — `generateReject` produces the 404 response when the order is not visible to the caller.
- **`@infrastructure/i18n`** — `t()` for localised error strings (e.g. `returns.order-not-found`).
- **`@infrastructure/runtime/database`** — `withTransaction` provides the session for the atomic cancel.
- **`@infrastructure/persistence/create-repository`** — `toObjectId` converts the fulfillment-order ID for storage.
- **`@kernel/outbox`** — `nudgeOutbox` flushes the `requested`/`closed` events enqueued inside the transaction.
- **`@modules/delivery`** (`deliveryService`) — `cancelRemainder` marks the fulfillment-order lines cancelled and returns the affected lines + whether they were awaiting stock; `remainderOptions` lists what is still cancelable.
- **`@modules/inventory`** (`inventoryService`) — `refreshStockCacheForProducts` invalidates the in-memory stock cache after units are returned.
- **`@modules/orders`** (`orderService`, `isBuyer`) — `getForCaller` loads the order scoped to the caller; `releaseStock` returns units (or backorder allowance) to inventory; `isBuyer` distinguishes buyer from staff.
- **`@modules/payments`** (`paymentService`) — `openReturnRefund` creates the refund record inside the transaction; `sendOpenedRefund` dispatches it after commit.
- **`../repository`** (`returnRepository`) — `lockOrder`, `findByOrderId`, `create` for the Return row within the same session.
- **`./outcome`** — Shared outcome helpers (`opened`, `badCancellation`, `forbidden`, `windowClosed`, `enqueueRequested`, `enqueueClosed`, `recordOpened`, `badLines`, `badStatement`, `nothingToCancel`).
- **`./cancel-right`** (`cancelRefusalOf`) — The core authorization rule (key, window, exclusions) reused here.
- **`./cancellation-refund`** (`cancellationRefundOn`) — Computes the `{ total, shipping }` breakdown for the refund.
- **`./projection`** (`syncReturnStatus`) — Updates the order-level return-status field after the cancellation.
- **`@modules/shop`** (`returnPostagePayer`) — Determines who pays return postage, stamped on the Return row.

## Notes

- **Closed at creation.** Unlike other return kinds, a cancellation has no open phase; `status` is `'closed'` from the first write, and both `decidedAt` and `closedAt` are the same timestamp.
- **Input contract is strict.** `fulfillmentOrderId` must be present and `lines` must be *absent* — the remainder is always computed by `delivery`, never caller-supplied. Providing `lines` short-circuits to `badCancellation()`.
- **Refund is fire-and-forget post-commit.** If `sendOpenedRefund` throws or the provider refuses, the Return is already closed; the durable refund record is picked up later by the payment sweep. Nothing blocks on the provider response.
- **Backorder distinction.** When `cancelled.waitingForStock` is true, released units are tagged `kind: 'backorder'` so `orderService.releaseStock` returns a preorder allowance rather than shelf inventory.
- **Key-before-statement ordering.** `cancelRefusalOf` is checked (returning `forbidden` 403) before `checkStatement` validates the buyer's stated date/channel. This ensures a caller lacking the refund key does not receive a more specific validation error.
- **The file is truncated** in the source provided; the tail of `createCancellation` (the happy-path delegation to `cancelUnderLock` / `announceCancelled` and the final outcome mapping) is not visible.
