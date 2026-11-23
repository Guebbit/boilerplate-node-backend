---
source: src/modules/delivery/tests/unit/preorder.test.ts
source_sha256: 6e23cf8c3d92f79164905b6b7c2949307f57ef3c5503feed18f272ce1de83124
context_sha256: dc41f2add57ca1ed4bb99e097ceb372a8befb275516f631188949b4079b90680
generated_at: 2026-11-22T05:05:08.801923+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/tests/unit/preorder.test.ts

## Purpose
Unit tests for the pure preorder slip rules: what a moved release date owes the buyer, and which expected dates the daily sweep still needs to notify about. The shop only notifies; nothing in these rules asks the buyer anything or cancels. Each test case corresponds to a row of the rule table in `src/modules/products/domain/preorder.ts`, run against a fixed clock and the `Europe/Rome` zone.

## Key elements
- **Fixtures**: `DAY`/`HOUR` constants, `AGREED` (`2026-12-01T00:00:00Z`), `ZONE` (`Europe/Rome`), `afterAgreed(days)` for offsets from the agreed date, and `line(productId, quantity, shipped)` to build order lines.
- **`judgeSlip`**:
  - Any later shop day yields `notify`, whether the slip is 5 days, 29 days or a year; there is no length at which silence means anything else.
  - Clearing a previously set date yields `notify`.
  - Earlier or equal dates yield `earlier`.
  - A move within the same Rome calendar day yields `earlier`, while a move to the next Rome day yields `notify`.
  - With no prior date, the result is `earlier`, whether the next date is set or not.
- **`expectedDateOf`**: returns the latest release date among lines that are still waiting. Fully shipped lines are ignored. It returns `undefined` if any line still waiting has no date, or if nothing is left to wait for.
- **`judgeMove`**: returns `undefined` when nothing was promised (`{}`). Otherwise it delegates to the slip judgement, so short slips, long slips and cleared dates all `notify`. A date that was already cleared and is cleared again gives `earlier`.
- **`needsDueNotice`**: tested against `now = 2026-12-20T00:00:00Z`. It returns true for:
  - a date already passed that was never noticed;
  - a date exactly now;
  - a date 23 hours ahead.

  It returns false for:
  - a date 25 hours ahead or far ahead;
  - a date already told about (`dueNoticeFor` equal to `expectedAt`);
  - no expected date.

  It returns true again if the date moved later than `dueNoticeFor`.
- **`slippedDays`**: counts whole shop days (in the given zone) between promise and expectation, floored at 0, regardless of the hour either date carries.
- **`promisedAfterNotice`**: the date the buyer holds after a notice.
  - A later date is taken, including when the buyer held none.
  - An earlier date, the same date, or no date named returns `undefined` (leave the held date alone).
  - `null` clears the held date, returning `null`, or `undefined` if there was nothing to remove.

## Relationships
Imports `expectedDateOf`, `judgeMove`, `judgeSlip`, `needsDueNotice`, `promisedAfterNotice` and `slippedDays` from the domain barrel `src/modules/delivery/domain/index.ts`. The rules themselves live in `src/modules/delivery/domain/preorder.ts`, which the barrel presumably re-exports; this test does not import it directly.

## Notes
- Day comparisons are by shop-day in `Europe/Rome`, not raw elapsed time. For example, `2026-12-04T23:00Z` and `2026-12-05T20:00Z` are both 5 December in Rome, and `slippedDays` counts 2 shop days where the clock difference is under 2 days.
- The due-notice window looks one day ahead, so the buyer hears before the date is missed.
- `promisedAfterNotice` distinguishes `undefined` (no change) from `null` (clear the held date).
