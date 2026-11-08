---
source: src/modules/delivery/domain/preorder.ts
sha256: 3bb89917fad403206aaea1cfcbf49b69fa6ad0f0a40ab41d21833d8bac818f80
generated_at: 2026-11-08T05:29:11.965827+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/domain/preorder.ts

## Purpose

Pure domain rules for preorders whose release date slips. Given a current date, a new date, and a shop timezone, it decides whether the buyer must be told (email) or left in silence, computes the date a fulfillment order is now expected, and derives the board state and lateness a UI or sweep reads. All functions are side-effect-free; the clock is always an argument, so every branch is testable in isolation.

## Key elements

- **`SlipVerdict`** — discriminated union: `'earlier'` (no email) or `'notify'` (buyer must be told).
- **`judgeSlip(facts)`** — core decision: compare `next` vs `expectedAt` on the shop calendar; later or cleared → `notify`, earlier/same-day/no-date → `earlier`.
- **`expectedDateOf(lines, releaseDateOf)`** — latest catalogue date among lines that still have remaining units; `undefined` if any waiting line has no date.
- **`expectedDateOfWaiting(waiting, dateOf)`** — same rule but short-circuits for `defaulted` orders (they keep their original 30-day promise).
- **`judgeMove(facts, next, timeZone)`** — wraps `judgeSlip` with the `agreedAt` guard; returns `undefined` when nothing was ever promised.
- **`DUE_NOTICE_LEAD_MS`** — one day; the sweep must reach the buyer before the promised date (FTC mail-order rule).
- **`needsDueNotice(facts, now)`** — whether the "you will miss the date" email is due; deduplicates via `dueNoticeFor`.
- **`slippedDays(agreedAt, expectedAt, timeZone)`** — non-negative whole-day gap for the board's lateness column.
- **`promisedAfterNotice(promisedAt, expectedAt)`** — three-way return (`Date` | `null` | `undefined`) encoding replace / remove / leave-unchanged for the buyer's held date.
- **`boardStateOf(facts)`** — maps `FulfillmentOrderStatus` + `holdReason` to `PreorderFulfillmentState` (canceled, shipped, waiting, allocated).
- **`isLate(facts, now)`** — units remain, date has passed, order is not closed/canceled; powers the Late board view.

## Relationships

- **`@domain-primitives/time`** — imports `DAY_MS` and `dayInZone` for all timezone-aware day arithmetic.
- **`./fulfillment`** — imports `remainingOf`, `remainingOfLine`, and the `FulfillmentLine` type to filter lines and count remaining units.
- **`@types`** — imports `FulfillmentHoldReason`, `FulfillmentOrderStatus`, `PreorderFulfillmentState` for board-state mapping.
- **`services/notice.ts`** — consumes `judgeSlip` / `judgeMove` to decide whether and what to email.
- **`services/preorder-sweep.ts`** — consumes `needsDueNotice` and `DUE_NOTICE_LEAD_MS` to drive the daily miss-date email.
- **`services/release-date-impact.ts`** — consumes `judgeMove` and `expectedDateOfWaiting` when a catalogue date changes.
- **`services/slip.ts`** — consumes `slippedDays` and `promisedAfterNotice` for the consent-reminder flow.
- **`presenter.ts`** — consumes `boardStateOf` and `isLate` to render the staff board.
- **`domain/index.ts`** — re-exports this module's public API for the rest of the delivery domain.
- **`tests/unit/preorder.test.ts`** — unit-tests every exported function here.

## Notes

- Comparisons are **day-granular** on the shop's calendar, not instant-based. A date change that lands on the same shop day never triggers a notification.
- `defaulted: true` orders (the 30-day default promise) **never** re-follow the catalogue; they keep the date they were originally promised.
- `promisedAfterNotice` uses a three-state return: `Date` = store it, `null` = delete the stored value, `undefined` = leave whatever is there. Callers must distinguish all three.
- The module is intentionally **pure and passive**: it never cancels, never sends mail, never mutates state. It only returns a verdict or a number that a service layer acts on.
- `boardStateOf` maps `on_hold` + `awaiting_stock` → `waiting`, but any other hold reason still maps to `allocated`.
