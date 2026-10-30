---
source: src/modules/orders/services/retention.ts
sha256: 816a1c34151c4c35e8708a4a2b1c8aa7a58795029467e2feb2bc224cd0dc7867
generated_at: 2026-10-29T04:49:35.924088+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/retention.ts

## Purpose

Handles GDPR data-retention for orders after an account is erased or goes inactive. Because an order is an invoice kept under Art. 17(3)(b)/(e), erasure never deletes the row — it detaches the person from it, starts a per-order PII clock, and a later sweep scrubs whatever PII remains once the claim window closes.

## Key elements

- **`detachUserId(userId, session)`** — `personalData.erase` hook. Unsets `userId` on all orders placed by the account and starts each order's PII clock within the caller's Mongoose transaction.
- **`startOrderPiiClock(userId)`** — `personalData.minimise` hook. Stamps the same PII clock but keeps `userId` (inactive customers still see order history, minus PII after the window). Idempotent.
- **`anonymizeDueOrders()`** — Called by the `reap:orders` job. Scrubs PII on every order whose clock has started and whose retention window (guarantee or undelivered) has closed. Returns the count.
- **`cancelUnpaidOrders(orderIds)`** *(internal)* — Cancels never-paid orders via `cancelForErasureById`. Never rejects; individual failures are logged and left to the reservation sweep as a safety net.
- **`eraseUserOrders(userId, session)`** — The orders module's `personalData.erase` entry point. Finds open unpaid order IDs, detaches `userId`, clears the actor from timeline entries, and **returns** a deferred cancel thunk (not a promise that runs immediately) so stock/money-adjacent side-effects happen only after the erasure transaction commits.

## Relationships

- **`repository.ts`** — All database access (`detachUserId`, `startPiiClock`, `scrubDueForAnonymization`, `findOpenUnpaidIdsOf`) delegates to `orderRepository`.
- **`config.ts`** — Reads `orderPiiDaysAfterGuarantee` and `orderPiiDaysUndelivered` to determine each order's retention window.
- **`cancel.ts`** — Imports `cancelForErasureById` to release stock holds and cancel open payment intents for unpaid orders.
- **`timeline.ts`** — Imports `clearTimelineActor` to strip the erased user's name from timeline entries on every order they touched.
- **`registry.ts`** — Imports the `AfterErase` type; `eraseUserOrders` returns `AfterErase | undefined` so the kernel can run the deferred cancel post-commit.
- **`logger.ts`** — Structured info/warn/error logging at each stage.
- **`services/index.ts`** — Barrel re-exports the public functions above.
- **`jobs.ts`** — The `reap:orders` scheduled job is the caller of `anonymizeDueOrders`.
- **`tests/integration/erasure.test.ts`** — Integration tests exercising the full erase → detach → cancel flow.

## Notes

- **Deferred cancel, not immediate:** `eraseUserOrders` returns the cancel thunk rather than executing it. Moving stock or cancelling a payment intent at another module cannot be rolled back inside the erasure transaction, so the kernel runs it *after* commit.
- **Order of operations matters:** Open unpaid order IDs are read **before** `detachUserId` unsets `userId`, because the lookup depends on that field.
- **`cancelUnpaidOrders` never throws.** A single failing order is logged and skipped; the reservation sweep (up to 168 h for bank transfers) is the backstop.
- **Stryker mutations** are disabled on log-only lines to avoid noise in the mutation report.
- Orders are **never deleted**. The module's entire job is PII removal, not row removal.
