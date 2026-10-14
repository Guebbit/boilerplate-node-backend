---
source: src/modules/delivery/domain/preorder.ts
sha256: c73cb947dcbc9325c07dae7dd1a6c528d182a27f2a695b5d9f008feeef30a3fa
generated_at: 2026-10-14T15:22:59.649469+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/domain/preorder.ts

## Purpose

Pure domain rules for preorders whose delivery date slips. Given the agreed date, the current expected date, and the slip count, it decides what the buyer must be told (notify, ask, or nothing) and when silence converts to a cancellation. All time is injected as an argument so every branch is unit-testable without waiting.

## Key elements

- **`SILENT_SLIP_DAYS` (28)** / **`CONSENT_WINDOW_DAYS` (30)** – exported constants bounding the first-slip tolerance and the consent window.
- **`judgeSlip(facts): SlipVerdict`** – core decision: returns `'earlier'` (no notice), `'notify'` (short first slip, silence = keep waiting), or `'ask'` (long/repeated slip or no date, silence = cancel).
- **`answerBy(now): Date`** – computes the consent deadline (`now + 30 days`).
- **`needsDatePassedNotice(facts, now): boolean`** – sweep predicate: expected date has passed, buyer not yet in `awaiting` consent, and no notice sent since the date was set.
- **`hasWaitExpired(facts, now): boolean`** – sweep predicate: consent is `expired`, or `awaiting` with a deadline already past.
- **`slippedDays(agreedAt, expectedAt): number`** – non-negative whole-day gap for board columns.
- **`boardStateOf(facts): PreorderFulfillmentState`** – maps a fulfillment order (status, hold reason, consent) to the board's state vocabulary (`cancelled`, `shipped`, `allocated`, `waiting`, `awaiting_yes`).
- **`isLate(facts, now): boolean`** – true when expected date has passed, units remain, and the order is neither closed nor cancelled (feeds the ADMIN_SALES A5 "Late" view).

## Relationships

- **`domain/fulfillment.ts`** – imports `remainingOf` (used by `isLate`) and the `FulfillmentLine` type (used in `BoardFacts`).
- **`domain/index.ts`** – barrel file that re-exports this module for other consumers.
- **`types/index.ts`** – source of `FulfillmentConsent`, `FulfillmentHoldReason`, `FulfillmentOrderStatus`, `PreorderFulfillmentState`.
- **`services/preorder-sweep.ts`** – calls `needsDatePassedNotice` and `hasWaitExpired` each day to drive notices and cancellations.
- **`services/slip.ts`** – calls `judgeSlip` and `answerBy` when a date change is processed.
- **`services/notice.ts`** – acts on the `'notify'` / `'ask'` verdicts to send or schedule buyer communication.
- **`services/cancel-remainder.ts`** – executes the cancellation when `hasWaitExpired` is true.
- **`services/read.ts`** – assembles `SweepFacts` / `BoardFacts` from the fulfillment order for the sweep and board queries.
- **`presenter.ts`** – consumes `boardStateOf` and `slippedDays` to render the preorder board.
- **`tests/unit/preorder.test.ts`** – unit tests covering every `judgeSlip` branch and the sweep predicates.

## Notes

- **28 vs 30 days:** the FTC cap is 30 days; this file uses 28 to leave a two-day margin for time zones and inclusive day-counting. The consent window still uses the full 30.
- **`needsDatePassedNotice` is keyed on `expectedAt`, not `agreedAt`.** After a buyer accepts a slip the agreed date is long past; only the current expected date can still be "missed."
- **`boardStateOf` treats a staff hold on already-allocated goods as `allocated`, not `waiting`.** The stock is set aside; the hold is an operational pause, not a stock problem.
- All functions are pure (clock via parameter) and have no I/O side effects, keeping the domain layer free of service dependencies beyond `fulfillment.ts`'s `remainingOf` helper.
