---
source: src/modules/delivery/services/preorder-sweep.ts
sha256: 66689aa2343fd2a230d943941890264e4abac362edeb2cd348ef46eaaeb391f6
generated_at: 2026-10-14T15:31:47.315845+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/preorder-sweep.ts

## Purpose

Implements the daily sweep over waiting preorders (PRODUCT_STATES P5). In a single pass it (1) asks buyers whose expected date has passed with no stock, and (2) marks and announces waits whose 30-day silent window has expired so that `returns` can cancel and refund. Only `on_hold` orders awaiting stock are considered; already-allocated goods are out of scope (they appear in the admin Late view instead).

## Key elements

- **`runPreorderSweep(now?)`** — Exported entry point. Iterates `findDatePassed` orders (calling `askOne` + `mailNotice`), then `findWaitsExpired` orders (calling `expireOne`). Returns a `PreorderSweepResult` with `asked` / `expired` counts.
- **`PreorderSweepResult`** — Exported interface: `{ asked: number; expired: number }`.
- **`askOne(fulfillmentOrderId, now)`** — Internal. In a transaction, re-reads the order, verifies it is still `on_hold` / `awaiting_stock` / needs a date-passed notice, then records the notice. Returns the `SentNotice` to mail after commit.
- **`expireOne(fulfillmentOrderId, now)`** — Internal. In a transaction, checks `hasWaitExpired`; if not yet `expired`, claims the consent to `FulfillmentConsent.expired`, then calls `announceWaitExpired`. If already expired, re-announces without a write (cancel hasn't landed yet).

## Relationships

- **`scripts/ops/sweep-preorders.ts`** — Operational entry script that invokes `runPreorderSweep`.
- **`src/modules/delivery/domain/preorder.ts` / `domain/index.ts`** — Provides `hasWaitExpired` and `needsDatePassedNotice` predicates used to gate the two sub-jobs.
- **`src/modules/delivery/repository.ts`** — `fulfillmentOrderRepository.findDatePassed`, `findWaitsExpired`, `findInSession`, and `claim` (optimistic-concurrency update).
- **`src/modules/delivery/services/act.ts`** — `runAct` wraps each per-order operation in its own transaction; a refused act means the condition was already settled.
- **`src/modules/delivery/services/announce.ts`** — `announceWaitExpired` records the expiry announcement inside the `expireOne` transaction.
- **`src/modules/delivery/services/notice.ts`** — `recordNotice` (persisted in `askOne`) and `mailNotice` (sent after commit) handle the buyer-facing communication.
- **`src/types/index.ts`** — `FulfillmentConsent`, `FulfillmentHoldReason`, `FulfillmentOrderStatus` enum values used for state checks.
- **Integration tests** (`preorder-board.test.ts`, `preorder-late.test.ts`, `cancel-remainder.test.ts`) — Exercise sweep idempotency, late-notice timing, and the cancel-after-expiry path.

## Notes

- **Idempotent by design.** Re-running the sweep on the same day is safe: a date already noticed is skipped, and an already-expired wait is re-announced (not re-written) until the `returns` cancel lands.
- **Sequential, per-order transactions.** Each order is handled in its own `runAct` transaction; mail is sent only after the commit succeeds. A failure on one order does not affect the rest.
- **`now` is injectable.** `runPreorderSweep` defaults to `new Date()` but tests pass a fixed instant to control "today."
- **Re-announce loop.** `expireOne` deliberately skips the write when consent is already `expired`, so the announcement persists daily until `returns` processes the cancellation.
