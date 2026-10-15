---
source: src/modules/returns/services/cancel-remainder.ts
sha256: 64c9cd22624f9001b30658f627a3f6b2f85eac1dffc06d1e288acf0dbc064cf0
generated_at: 2026-10-15T11:55:20.930990+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/cancel-remainder.ts

## Purpose

Cancels the unshipped remainder of a single fulfillment order as a `kind: cancellation` Return that is **closed at creation time**. It exists because a remainder cancel atomically moves money (refund), stock (inventory release), shipping rules, and the delivery state — and only the `returns` module already reaches all four. Once a fulfillment order has shipped, the order can no longer be cancelled whole; this is the per-fulfillment-order path for the buyer's CRD Art. 16 withdrawal or a staff refund of unshipped items.

## Key elements

- **`createCancellation`** (export) — entry point for `POST /returns` with `kind: cancellation`. Validates the input, loads the order, resolves the target fulfillment order via `remainderOptions`, runs caller checks, then commits and post-processes.
- **`refuseCaller`** — gate before any write. For the buyer: enforces `reason === 'withdrawal'`, the withdrawal window (`order.withdrawUntil`), and Art. 16 exclusions. For staff: requires the `payments.any.update` ability key (step-up `critical`) and runs `orderService.ownMoneyRefusalFor` to prevent self-refund / rank violations.
- **`cancelUnderLock`** — the single DB transaction: locks the order row, calls `cancelRemainder` (delivery), releases inventory (preorder or shelf units depending on `waitingForStock`), writes the closed Return row, and enqueues the `RETURN_CLOSED` outbox event.
- **`rowFor`** — builds the `ReturnDocument` partial: lines enriched with product title/price from the order, refund breakdown from `cancellationRefundOn`, `returnPostage` from shop config.
- **`refund`** — post-commit; calls `paymentService.refundForReturn`. A provider refusal is logged (not thrown) so the payment sweep can retry; the Return is already closed.
- **`announceCancelled`** — post-commit side-effect chain: `nudgeOutbox`, audit record, stock-cache refresh, `syncReturnStatus`, the refund above, and (buyer only) the `withdrawal-acknowledged` mail via `mailReturnNotice`.
- **`forbidden`** — shorthand 403 outcome using `generateReject` + `ERROR_CODES.FORBIDDEN`.
- **`Cancelled`** (interface) — the shape returned by `cancelUnderLock`: the created Return doc plus the product-quantity lines.

## Relationships

- **`src/modules/delivery/services/act.ts`** — `cancelRemainder` performs the actual line-cancellation and order-summary recompute inside the transaction session.
- **`src/modules/delivery/services/read.ts`** — `remainderOptions` and `waitHasExpired` supply the list of cancelable fulfillment orders and their stock-wait state.
- **`src/kernel/outbox.ts`** — `enqueueOutboxEvent(RETURN_CLOSED, …)` is written in-transaction; `nudgeOutbox` is called post-commit to trigger dispatch.
- **`src/kernel/ability.ts` / `src/kernel/permissions.ts`** — `holdsKey` checks the refund key; `callerForSubject` resolves the subject for ability lookups; `systemCallerContext` is available for system-initiated paths.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` provides the session used by `lockOrder`, `cancelRemainder`, inventory release, and `returnRepository.create`.
- **`src/infrastructure/i18n/index.ts`** — `t()` for user-facing error messages (forbidden, order-not-found).
- **`src/infrastructure/http/response.ts`** — `generateReject` builds the 403/404 error payloads.
- **`src/infrastructure/persistence/create-repository.ts`** — `toObjectId` converts the string `fulfillmentOrderId` to an ObjectId for the Return row.
- **`src/infrastructure/adapters/logger.ts`** — `logger.error` on refund failure (the "payment sweep retries it" path).
- **`src/modules/account/tests/unit/reauth-policy.test.ts`** — validates the `stepUp: critical` reauth flow that gates the `payments.any.update` key this file requires for staff.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — exercises the delivery-side `cancelRemainder` logic that this file invokes in-transaction.

## Notes

- The Return is **closed at creation** (`decidedAt` and `closedAt` are the same timestamp). There is no open→closed lifecycle here; the only post-commit risk is the refund, which is handled out-of-band by the payment sweep.
- `input.lines` must be **undefined**; if a caller supplies it, the function short-circuits with `badCancellation()`. Lines are always derived from the fulfillment order.
- Inventory release is kind-aware: `cancelled.waitingForStock` toggles between `preorder` allowance and shelf-unit release. Forgetting this distinction would corrupt preorder allocations.
- The refund catch block is annotated with `// Stryker disable all` / `// Stryker restore all` — mutation testing is explicitly suppressed there because the "do nothing but log" behaviour is intentional, not a bug.
- The `byBuyer` flag in `announceCancelled` is the **only** thing that triggers the withdrawal-acknowledgement mail; staff-initiated cancels stay silent to the buyer.
- The file is an ES module (no `default` export); the single public symbol is `createCancellation`.
