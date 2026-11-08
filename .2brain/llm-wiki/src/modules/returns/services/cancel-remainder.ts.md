---
source: src/modules/returns/services/cancel-remainder.ts
sha256: 549b39e88ee40647e8d59be24db9d15e1130e295b1c919e63ca37676fe8fe692
generated_at: 2026-11-08T08:01:48.594165+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/cancel-remainder.ts

## Purpose

Implements the "cancel the unshipped remainder" flow (`POST /returns` with `kind: cancellation`). Unlike a full order cancellation, this targets a single fulfillment order and creates a Return row that is **closed at creation time** (no open→close lifecycle). It moves money, returns stock, and adjusts the shipping rule atomically under the order's lock row, then fires the provider refund and post-commit side effects.

## Key elements

- **`createCancellation`** (exported) — Entry point. Validates input shape (requires `fulfillmentOrderId`, rejects caller-supplied `lines`), loads the order scoped to the caller, runs `refuseCaller`, then `cancelUnderLock` and `announceCanceled`.
- **`refuseCaller`** — Pre-write gate. Enforces that a buyer must name `withdrawal`; checks the refund key first (403 before anything else); validates the statement window via `checkStatement` and `cancelRefusalOf`. Returns either a refusal outcome or the `Statement` to persist.
- **`cancelUnderLock`** — The single transaction (`withTransaction`): locks the order row, calls `deliveryService.cancelRemainder`, computes the refund breakdown via `cancellationRefundOn`, releases stock through `orderService.releaseStock` (using `kind: 'backorder'` when the fulfillment order was held for stock), writes the closed Return row, enqueues `requested` and `closed` outbox events, and opens a refund record via `paymentService.openReturnRefund` when the amount is non-zero.
- **`rowFor`** — Builds the `Partial<ReturnDocument>` for the new Return: status `'closed'`, `kind: 'cancellation'`, lines enriched with product title/price from the order, `returnPostage` from `returnPostagePayer()`.
- **`refund`** — Post-commit: calls `paymentService.sendOpenedRefund` if a refund record was opened. A provider refusal is intentionally left for the payment sweep; the Return is already closed.
- **`announceCanceled`** — Post-commit side-effect chain: `nudgeOutbox`, audit via `recordOpened`, optional `reportCanceled` callback (lost-parcel analytics), `inventoryService.refreshStockCacheForProducts`, `syncReturnStatus`, then `refund`. Returns the `opened` outcome.
- **`Canceled`** (interface) — Bundle returned by the transaction: the created Return, the canceled lines, the opened refund record (or `null`), and an optional `reportCanceled` closure.

## Relationships

- **`src/modules/delivery/services/act.ts` / `index.ts`** — Calls `deliveryService.cancelRemainder` inside the transaction to mark fulfillment lines canceled and recompute the order summary.
- **`src/modules/inventory/services/index.ts`** — Calls `inventoryService.refreshStockCacheForProducts` after commit to invalidate cached stock levels for the affected products.
- **`src/modules/orders`** (`orderService`, `isBuyer`, `OrderDocument`) — Loads the order scoped to the caller, releases stock via `orderService.releaseStock`, and reads order fields (items, currency, `orderNumber`) for the Return row.
- **`src/modules/orders/domain/rules.ts`** — Indirectly referenced through the order service for stock-release rules.
- **`src/domain-primitives/money.ts`** — Uses `NO_MONEY` and `toMinorUnits` to decide whether a refund is owed.
- **`src/infrastructure/runtime/database.ts`** — Provides `withTransaction` for the atomic lock-then-write block.
- **`src/infrastructure/persistence/create-repository.ts`** — Uses `toObjectId` to cast the `fulfillmentOrderId` string to an ObjectId for the Return row.
- **`src/infrastructure/http/response.ts`** — Imports `generateReject` (used in refusal paths).
- **`src/infrastructure/i18n/index.ts`** — Imports the `t` translation helper.
- **`src/kernel/outbox.ts`** — Calls `nudgeOutbox` after commit to flush enqueued events (`requested`, `closed`).
- **Siblings in `./`** — `cancel-right` (`cancelRefusalOf`), `cancellation-refund` (`cancellationRefundOn`), `projection` (`syncReturnStatus`), `outcome` (all outcome constructors), `repository`, `domain` (`checkStatement`).

## Notes

- The Return is **closed on creation** (`decidedAt === closedAt === now`); there is no "open" phase. This distinguishes it from the standard return/withdrawal flow.
- The refund provider call (`sendOpenedRefund`) happens **after** the transaction commits. If the provider refuses, the refund record stays open and is picked up by the payment sweep — the Return's status is unaffected.
- Buyer callers are restricted to reason `withdrawal`; staff may supply any reason (or `withdrawal` with the buyer's stated day/channel for audit).
- The refund-key check (`cancelRefusalOf`) runs **before** window/statement validation so an unauthorized caller receives a 403 without leaking which specific rule would have failed.
- `fulfillmentOrderId` is **required**; caller-supplied `lines` are **rejected** (`badCancellation`). The system determines which lines to cancel from the fulfillment order's own state.
- Stock release uses `kind: 'backorder'` when `canceled.waitingForStock` is true (preorder/prealloc context) vs. plain shelf units otherwise.
- The file is truncated in the graph snapshot; the tail of `createCancellation` (the `if` branch after `orderService.getForCaller`) is not visible here.
