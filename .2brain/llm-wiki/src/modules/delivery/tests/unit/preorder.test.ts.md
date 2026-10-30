---
source: src/modules/delivery/tests/unit/preorder.test.ts
sha256: 8e7a1f6fedb85d83ef654f8c23f0eff124c0eb4392c3b9316a0abae0a0904472
generated_at: 2026-10-29T03:49:54.360055+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/preorder.test.ts

## Purpose

Unit tests for the pure preorder-slip functions defined in the delivery domain. Verifies the decision logic the shop uses to tell a buyer about a moved or cleared delivery date, to compute the effective expected date across order lines, and to determine when the daily sweep should fire a due-notice. All cases run against a fixed reference clock so results are deterministic.

## Key elements

- **`afterAgreed(days)`** – test helper; returns a `Date` `days` after the fixed `AGREED` instant (`2026-12-01`).
- **`line(productId, quantity, shipped)`** – test helper; builds an order-line object shaped like the domain's line type.
- **`describe('judgeSlip')`** – verifies that any later date (or a cleared date) yields `'notify'`, while an earlier date or a new date when none existed yields `'earlier'`.
- **`describe('expectedDateOf')`** – verifies that the effective date is the max release date among lines that still have unshipped quantity, and is `undefined` when any waiting line has no date or all lines are fully shipped.
- **`describe('judgeMove')`** – verifies that a move of a promised date (including clearing it) produces a `'notify'` judgement, while re-clearing an already-cleared date produces `'earlier'`; returns `undefined` when nothing was promised.
- **`describe('needsDueNotice')`** – verifies the 24-hour look-ahead window (23 h → `true`, 25 h → `false`), the "already told about" guard via `dueNoticeFor`, and that a date moved later than the last notice re-triggers.
- **`describe('slippedDays')`** – verifies whole-day arithmetic and the floor at zero.
- **`describe('promisedAfterNotice')`** – verifies the "latest date wins" rule, that `null` clears the held date, and that earlier/same/absent dates are no-ops.

## Relationships

- **Imports from `src/modules/delivery/domain/index.ts`** – pulls the six pure functions under test (`judgeSlip`, `judgeMove`, `expectedDateOf`, `needsDueNotice`, `slippedDays`, `promisedAfterNotice`).
- **Indirectly exercises `src/modules/delivery/domain/preorder.ts`** – the functions are defined there and re-exported through the barrel; no other source file is touched by these tests.

## Notes

- The module header stresses that every tested row is a pure judgement: no side-effects, no buyer I/O, no cancellation. Tests should never assert on anything beyond the returned kind/value.
- `needsDueNotice` uses a 24-hour look-ahead boundary; the 23-hour/25-hour pair in the test table is the exact boundary guard—adjusting the window in `preorder.ts` will break this case.
- `promisedAfterNotice` distinguishes `null` (explicitly clear the held date) from `undefined` (no date supplied). The test for `null` asserts the return value is literally `null`, not `undefined`.
- All dates are UTC (`T00:00:00Z`) to avoid timezone drift in CI; the `DAY`/`HOUR` constants are millisecond integers, not `Date` objects.
