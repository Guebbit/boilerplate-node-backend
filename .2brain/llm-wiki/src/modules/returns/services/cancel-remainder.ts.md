---
source: src/modules/returns/services/cancel-remainder.ts
sha256: fdb244ee970eb174f0239422ebec6c0207169880902fe89682c835479aad0c04
generated_at: 2026-11-14T21:36:44.550246+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/cancel-remainder.ts

## Purpose

Implements the "remainder cancel" flow: canceling the unshipped lines of a specific fulfillment order as a `Return` of `kind: 'cancellation'` that is **closed at creation time**. It exists because a whole-order cancel is impossible once anything has shipped; the remainder must be unwound one fulfillment order at a time, moving money, stock, and the shipping rule atomically. The `returns` module owns this because it is the only module that already reaches all four concerns (delivery, inventory, payments, order).

## Key elements

- **`createCancellation`** (exported) — The single public entry point (`POST /returns` with `kind: 'cancellation'`). Validates the caller, runs the transaction, then triggers post-commit side effects. Returns a `CreateReturnOutcome`.
- **`rowFor`** — Builds the `Partial<ReturnDocument>` to persist: status `closed`, kind `cancellation`, line items mapped from the order's own items, refund amounts, postage payer.
- **`cancelUnderLock`** — The single DB transaction: locks the order row, calls into delivery to mark lines canceled, releases stock (with backorder awareness), writes the Return, enqueues `requested`/`closed` outbox events, and opens a refund record via payments when the amount is non-zero.
- **`refund`** — Post-commit: sends the already-recorded refund through the payment service. A refusal is left to the payment sweep; nothing blocks on it.
- **`announceCanceled`** — Post-commit orchestration: nudges the outbox, records the audit row, calls `reportCanceled` (lost-parcel analytics), refreshes the inventory stock cache, syncs the order's return-status projection, then fires the refund.
- **`refuseCaller`** — Pre-transaction authorization gate: enforces buyer-vs-staff reason rules, checks the refund key (403 first), validates the buyer's statement (14-day withdrawal window), and re-checks line eligibility. Returns a refusal outcome or the `Statement` to write.
- **`Canceled`** (internal interface) — The value returned by `cancelUnderLock` once committed: the created Return doc, the canceled lines, the optional opened refund record, and an optional `reportCanceled` callback.

## Relationships

- **`src/modules/delivery/index.ts`** — Re-exports `deliveryService` and `ActRefusal`; this file calls `cancelRemainder` on it inside the transaction and receives the `reportCanceled` callback.
- **`src/modules/delivery/services/act.ts`** — The implementation behind `deliveryService.cancelRemainder`; marks lines canceled and recomputes the order summary within the shared session.
- **`src/modules/delivery/services/index.ts`** — Intermediate barrel for the delivery service exports consumed above.
- **`src/modules/inventory/index.ts`** — Re-exports `inventoryService`; this file calls `refreshStockCacheForProducts` post-commit.
- **`src/modules/inventory/services/index.ts`** — The implementation behind the stock-cache refresh call.
- **`src/modules/orders/domain/rules.ts`** — Source of `isBuyer` (authorization) and `orderService.releaseStock` (returning units or backorder allowance to inventory within the transaction).
- **`src/domain-primitives/money.ts`** — Provides `NO_MONEY` (zero-check before opening a refund) and `toMinorUnits` (currency comparison).
- **`src/infrastructure/http/response.ts`** — Provides `generateReject` for shaping refusal HTTP responses.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — Provides `t` for localized refusal messages.
- **`src/infrastructure/persistence/create-repository.ts`** — Provides `toObjectId` to coerce fulfillment-order IDs for storage.
- **`src/infrastructure/runtime/database.ts`** — Provides `withTransaction`, the single transaction boundary for the whole cancel.
- **`src/kernel/outbox.ts`** — `nudgeOutbox()` is called post-commit to flush queued events.
- **`src/infrastructure/adapters/logger.ts`** — Indirectly used through the audit/`recordOpened` path for structured logging of the cancellation.

## Notes

- **Closed-on-write invariant.** Unlike other Return kinds, a cancellation Return never transitions to `closed` later — `rowFor` sets both `decidedAt` and `closedAt` to the same timestamp. The refund record is opened in the same transaction but *sent* post-commit; a provider refusal leaves the refund open for the sweep rather than reopening the Return.
- **Backorder vs. shelf stock.** If the fulfillment order was `waitingForStock`, `releaseStock` is called with `kind: 'backorder'` on every line. Forgetting this distinction would corrupt shelf inventory counts.
- **Authorization order is deliberate.** `refuseCaller` checks the refund key (`403`) *before* the reason/statement checks, so an unauthorized caller never learns which other rule would also fail.
- **`reportCanceled` is optional and called post-commit.** It is a callback produced by the delivery cancel specifically for lost-parcel order cancels (audit + analytics). It is not a repository write.
- **`input.lines` must be absent.** The exported entry point rejects the request if the caller supplies `lines`; the lines are always derived from the fulfillment order's own state to prevent tampering.
