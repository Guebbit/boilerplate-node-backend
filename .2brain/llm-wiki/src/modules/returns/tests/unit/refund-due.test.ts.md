---
source: src/modules/returns/tests/unit/refund-due.test.ts
source_sha256: 65dabfb452f53807f2eb53d637c7e77ce7b957671d67b4a5604b88ec4515bfa7
context_sha256: 3f7db2c4b12ad01e1a0454176c75a98e26a3cbcf5ee6d89e0d3d9a73c1f7c2d4
generated_at: 2026-11-22T07:39:39.407124+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/tests/unit/refund-due.test.ts

## Purpose
Unit tests for the legal refund deadline of a return. They cover Directive 2011/83/EU Art. 13(1) and (3) for a withdrawal and Directive 2019/771 Art. 16(3)(b) for a faulty item, counted on the shop's calendar (`Europe/Rome`). The file pins down which date applies, and when no date applies, for each return reason.

## Key elements
- `ROME`: the zone the deadline is read in (`Europe/Rome`).
- `END_OF_DAY_15_WINTER`: the expected deadline for a withdrawal told on 2026-03-01. It is `2026-03-15T22:59:59.999Z`, the end of day 15 in Rome (UTC+1).
- `describe('refundDueByOf')`: the main suite. It checks the following:
  - **Withdrawal:**
    - The deadline is the end of day 15 when the goods arrive earlier (day 3).
    - If the goods arrive after that date, the deadline is the arrival moment.
    - A proof of sending alone leaves the deadline at the end of day 15.
    - The earlier of the proof and the goods is the one counted against the date.
    - With nothing back yet, the deadline is the withdrawal date alone.
    - All of these (except the "earlier of the proof and the goods" case, which only checks `dueBy`) expect `dueRule: 'withdrawal'`.
  - **Faulty items:**
    - `defective` is due when the goods arrive.
    - `wrong_item` is due at the proof-of-sending date if the proof came before the goods.
    - Both expect `dueRule: 'faulty'`.
  - **No date (asserted with `toBeUndefined`):**
    - A `defective` return with nothing back.
    - An `other` (goodwill) return, whatever came back.
- `describe('proofOpensRefund')`: a table test. It expects `true` only for `withdrawal`, and `false` for `defective`, `wrong_item` and `other`.
- `describe('proofOpenedRefund')`: expects `true` for a withdrawal with a proof, and `false` for a withdrawal with no proof or for a faulty item with a proof (the proof only records there).

## Relationships
- Imports `refundDueByOf`, `proofOpensRefund` and `proofOpenedRefund` from `src/modules/returns/domain/index.ts`, which exposes the implementation in `refund-due.ts`. These are the units under test.
- Imports `withdrawalRefundDueBy` from `@modules/orders` (`src/modules/orders/index.ts`, with the logic in `src/modules/orders/domain/withdrawal.ts`). The tests use it to compute the `withdrawalDueBy` input from the date the withdrawal was told and `ROME`.

## Notes
- The doc comment on `END_OF_DAY_15_WINTER` says "day after `day`'s 14th", while the test names and the value describe it as the end of day 15. The expected value is the same either way.
- The fixtures are all in March (winter time, UTC+1), so the tests never exercise a daylight-saving transition.
