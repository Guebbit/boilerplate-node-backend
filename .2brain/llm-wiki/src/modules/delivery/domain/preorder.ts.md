---
source: src/modules/delivery/domain/preorder.ts
source_sha256: ce50c9c7370faaec1ded6bb6194066c8bea78e4c38f1f6958419e47769920a1c
context_sha256: 64fd743050aa83fa7103f50ba4926dc617be295f7bc7b7ab4312e6bcaa4cd1c3
generated_at: 2026-11-22T04:48:41.333959+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/domain/preorder.ts

## Purpose
Pure domain rules for a preorder whose release date slips. It decides what a moved date owes the buyer (an email or nothing), when the daily sweep should warn that a date will be missed, and how the staff board labels and flags fulfillment orders. A clock is always passed in as an argument, so every case is testable without waiting. The shop only informs the buyer; it never asks them anything and never cancels on its own. Silence means the buyer keeps waiting.

## Key elements
- `SlipVerdict` / `SlipFacts` / `judgeSlip` – compares the expected date with the new one as days in the shop's time zone. It returns `notify` when the date moves later or is cleared, and `earlier` (no email) when it moves earlier, stays on the same day, or there was no date to move.
- `expectedDateOf(lines, releaseDateOf)` – the latest release date among lines that still have units remaining. It returns `undefined` if any waiting line has no date, or if nothing is left to wait for.
- `expectedDateOfWaiting(waiting, dateOf)` – the same, except that an order promised the 30-day default (`defaulted === true`) keeps its own `expectedAt`.
- `MoveFacts` / `judgeMove(facts, next, timeZone)` – wraps `judgeSlip` for one fulfillment order. It returns `undefined` when `agreedAt` is absent, because nothing was promised.
- `DUE_NOTICE_LEAD_MS` – one day (`DAY_MS`). It is how far ahead of the expected date the sweep warns the buyer.
- `SweepFacts` / `needsDueNotice(facts, now)` – true when `expectedAt` is within a day or already past, and no notice was already sent for that exact date (`dueNoticeFor`).
- `slippedDays(agreedAt, expectedAt, timeZone)` – whole shop-calendar days between promised and expected, floored at 0. It is used for a board column.
- `promisedAfterNotice(promisedAt, expectedAt)` – the date the buyer holds after a notice. It returns the new date when later, `null` to clear it, and `undefined` to leave it unchanged.
- `BoardFacts` / `boardStateOf` – maps status and hold reason to `PreorderFulfillmentState`: canceled, shipped (closed), waiting (on hold for `awaiting_stock`), or otherwise allocated.
- `isLate(facts, now)` – true when `expectedAt` is before `now`, the order is neither closed nor canceled, and units remain.

## Relationships
- Imports `DAY_MS` and `dayInZone` from `@domain-primitives/time` for the day-level comparisons.
- Imports `remainingOf`, `remainingOfLine` and the `FulfillmentLine` type from `./fulfillment`.
- Imports `FulfillmentHoldReason`, `FulfillmentOrderStatus` and `PreorderFulfillmentState` from `@types`.
- `src/modules/delivery/tests/unit/preorder.test.ts` covers it, and `src/modules/delivery/tests/unit/fulfillment.test.ts` is also a neighbor.
- The services in `services/` (`notice.ts`, `preorder-sweep.ts`, `release-date-impact.ts`, `slip.ts`) and `presenter.ts` are its neighbors in the graph. By the comments, the release-date listener and staff preview share `judgeMove` and `expectedDateOfWaiting`, and the daily sweep uses `needsDueNotice`. The board (state, lateness, slipped days) uses `boardStateOf`, `isLate` and `slippedDays`. The file itself does not show which neighbor calls which.

## Notes
- `judgeSlip` compares days, not instants, so a move within the same shop day notifies nobody.
- `isLate` includes goods already allocated on the shelf, which the sweep deliberately leaves alone. The sweep only concerns goods not yet here, per the doc comments.
- `DUE_NOTICE_LEAD_MS` exists so a daily sweep reaches the buyer before the date. The comment cites the FTC mail-order rule, which counts from the promised date.
- `promisedAfterNotice` tracks the date the buyer holds, used to measure the next slip for the staff's consent reminder.
