---
source: src/modules/delivery/domain/preorder.ts
sha256: eb498a76d0c844adc5314ce470850d78346043f535a6dfea19bbef893857b2fa
generated_at: 2026-10-29T03:33:43.601882+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/domain/preorder.ts

## Purpose
Pure domain rules (PRODUCT_STATES P5) for what a slipped preorder date owes the buyer. All functions are side-effect-free and take the clock as an argument, so every branch is testable in isolation. The module encodes the "shop tells, person decides" policy: it never cancels on the buyer's behalf and never asks the buyer anything.

## Key elements
- **`judgeSlip(facts: SlipFacts): SlipVerdict`** — Core decision: if the new date is later (or cleared) → `notify`; if earlier or unchanged → `earlier`.
- **`expectedDateOf(lines, releaseDateOf)`** — Latest release date among lines that still have remaining quantity; `undefined` if any waiting line has no date (group cannot ship).
- **`expectedDateOfWaiting(waiting, dateOf)`** — Wraps `expectedDateOf` but short-circuits to the order's own `expectedAt` when the order was created with the default 30-day promise (no catalogue date to follow).
- **`judgeMove(facts: MoveFacts, next)`** — Delegates to `judgeSlip`; returns `undefined` when no date was ever promised (nothing to slip). Shared by the release-date listener and the staff preview.
- **`DUE_NOTICE_LEAD_MS`** (= `DAY_MS`) — Lead time before the expected date that the sweep must notify the buyer (FTC mail-order rule).
- **`needsDueNotice(facts, now)`** — True when the date is within one day (or past) and no notice has been sent for that exact date yet.
- **`slippedDays(agreedAt, expectedAt)`** — Whole-day gap, clamped at 0, for the board column.
- **`promisedAfterNotice(promisedAt, expectedAt)`** — Three-way update of the buyer's stored date: replace if later, remove (`null`) if cleared, leave (`undefined`) if earlier/unchanged.
- **`boardStateOf(facts): PreorderFulfillmentState`** — Maps fulfillment status + hold reason to the four board states (waiting, allocated, shipped, cancelled).
- **`isLate(facts, now)`** — True when units remain, the expected date has passed, and the order is neither closed nor cancelled.

## Relationships
- **`@domain-primitives/time`** — imports `DAY_MS` for the one-day lead constant and day-gap math.
- **`./fulfillment`** — imports `remainingOf`, `remainingOfLine`, and the `FulfillmentLine` type to filter out fully-shipped lines and compute totals.
- **`@types`** — imports `FulfillmentHoldReason`, `FulfillmentOrderStatus`, `PreorderFulfillmentState` used by `boardStateOf` and `isLate`.
- **`services/slip.ts`** — consumer of `judgeSlip` / `judgeMove` to decide whether to queue a notice.
- **`services/release-date-impact.ts`** — consumer of `expectedDateOf` / `judgeMove` when a catalogue date changes.
- **`services/preorder-sweep.ts`** — consumer of `needsDueNotice` and `DUE_NOTICE_LEAD_MS` in the daily sweep loop.
- **`services/notice.ts`** — consumer of the `SlipVerdict` to compose and send the email.
- **`presenter.ts`** — reads `boardStateOf`, `isLate`, `slippedDays` to render the staff board.
- **`domain/index.ts`** — barrel re-export so consumers can import from the module root.
- **`tests/unit/preorder.test.ts`** — direct unit tests for every exported function.
- **`tests/unit/fulfillment.test.ts`** — exercises `expectedDateOf` / `expectedDateOfWaiting` in the context of line-level fulfillment.

## Notes
- `expectedDateOf` returns `undefined` (not `null`) when *any* waiting line lacks a date — the whole group is dateless, not just that line.
- `promisedAfterNotice` uses a three-way return (`Date | null | undefined`): `null` explicitly clears the stored value, `undefined` means "leave it alone." Callers must distinguish these two.
- `judgeMove` returns `undefined` (not a verdict) when `agreedAt` is absent; callers must handle the optional before branching on `kind`.
- The module is intentionally pure and has no imports from services or presenters — it can be lifted into any test harness without mocking.
