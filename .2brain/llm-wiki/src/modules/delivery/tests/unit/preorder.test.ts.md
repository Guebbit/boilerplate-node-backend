---
source: src/modules/delivery/tests/unit/preorder.test.ts
sha256: 8febf78c836ca57fbdcfe787b6acb1b9abaf4c48f4d2839fb75d866c91af68f6
generated_at: 2026-10-14T15:39:46.736637+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/preorder.test.ts

## Purpose

Unit tests for the pure preorder-slip decision functions defined in `domain/preorder.ts`. Each test case pins a "fixed clock" (agreed date 2026-12-01, "now" 2026-12-20) and asserts which action the system should take—`notify`, `ask`, `earlier`, re-notice, or wait-expiry—for a given delivery-slip scenario.

## Key elements

- **`afterAgreed(days)`** – local helper that returns a `Date` offset from the fixed `AGREED` constant, used to build every test fixture.
- **`describe('judgeSlip')`** – table-driven tests covering the core decision: first slip ≤ 28 days → `notify`; first slip > 28 days or any subsequent slip → `ask`; earlier or same date → `earlier`; no date (`next: undefined`) → `ask`.
- **`describe('answerBy')`** – verifies the consent deadline is exactly `CONSENT_WINDOW_DAYS` after the question was asked.
- **`describe('needsDatePassedNotice')`** – confirms when the daily sweep must still notify about a passed date (never noticed, or passed again after a confirmed "keep waiting"), and when it must not (already noticed, date still ahead, no date, buyer already awaiting).
- **`describe('hasWaitExpired')`** – verifies wait-expiry logic: deadline passed while awaiting, short-circuit on `FulfillmentConsent.expired`, and no expiry after a `confirmed` answer.
- **`describe('slippedDays')`** – confirms the helper returns whole-day difference and clamps to zero.

## Relationships

- **`src/modules/delivery/domain/index.ts`** – re-exports the five functions under test (`judgeSlip`, `answerBy`, `needsDatePassedNotice`, `hasWaitExpired`, `slippedDays`) and the two constants (`CONSENT_WINDOW_DAYS`, `SILENT_SLIP_DAYS`). This file imports them via the relative path `../../domain`.
- **`src/modules/delivery/domain/preorder.ts`** – the implementation module that defines the logic being exercised; the test file's header comment explicitly maps each test row to a row of that module's decision table.
- **`src/types/index.ts`** – source of the `FulfillmentConsent` enum (`awaiting`, `confirmed`, `expired`) used as input fixtures for the `needsDatePassedNotice` and `hasWaitExpired` suites.

## Notes

- All timestamps are hard-coded ISO strings; there is no `Date.now()` or mock clock—determinism comes entirely from the fixed `AGREED` and `now` constants.
- The "silence threshold" is not a magic number in the test; it is referenced via the `SILENT_SLIP_DAYS` import (value 28 per the test case labels), so a change in the constant automatically keeps the boundary tests aligned.
- `judgeSlip` counts slip days from `agreedAt` (the original promise), not from `expectedAt` (the last rescheduled date). One test explicitly guards this distinction.
- `slippedDays` is tested only as a pure arithmetic helper; its clamping-at-zero behavior is the non-obvious contract.
