---
source: src/modules/shop-tasks/tests/unit/openings.test.ts
source_sha256: 9ca85d364ccbd5165165f73632141dc230e26ac760a176b0a49133ffbf03978e
context_sha256: 7e64a3418747b1bcb4656224d010a12f2e532506a69adca46e8f5b916b5d1d15
generated_at: 2026-11-22T07:46:14.098772+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop-tasks/tests/unit/openings.test.ts

## Purpose
Pure unit tests (no mocks, no database) for the opening builders in `src/modules/shop-tasks/domain/openings.ts`. Each builder turns a shop situation (delay, refund, payment mismatch, dispute, etc.) into a `SystemOpening`. The consent reminder (16 CFR 435.2) gets the most thorough coverage, including how the rule's reach depends on the shop's country.

## Key elements
- **Fixtures**
  - `NOW`: the fixed instant openings are judged at.
  - `DAY_MS`: one day in milliseconds.
  - `AGREED` and `AGREED_PLUS_30`: the agreed delivery date and that date plus 30 days.
  - `MISMATCH`: an amount/currency mismatch where the provider collected another amount.
  - `UNRECORDED`: a refund the import could not record.
  - `delay(overrides)`: builds a delay notice.
- **`consentDueOpening` tests**
  - Opens with `dueAt` = agreed + 30 days, using kind `consent_due`, route set `OrderEditing` and a `fulfillment_order` link.
  - Opens when the new date is past agreed + 30 days.
  - Does not open for a new date inside the 30-day grace.
  - Measures a later slip against the date the buyer now holds (`promisedAt`).
  - Never opens when `promisedAt` is undefined.
  - Country matrix, hard-coded rather than read from the constant under test:
    - Shops in US, PR, GU, VI, AS or MP open whatever the destination.
    - Other shops open when shipping to one of those six.
    - Shops outside the rule shipping elsewhere, or with the country undefined, never open.
- **"the other openings"**
  - A table (`all`) covers `refundOwedOpening`, `amountMismatchOpening`, `refundUnrecordedOpening`, `returnRefundShortOpening`, `paidWithoutHoldOpening`, `refundRefusedOpening` and `disputeOpening`.
  - Shared checks: the kind is a valid `TaskKind`, the route set is a declared `PERMISSION_SETS` name, and `openKeyOf` yields `kind:linkType:linkId`.
  - Amount mismatch routes to `AuditDisplay`. Its message shows expected against received, says "not reported" for missing figures (never "undefined"), and points to the relevant endpoints and `/audit`.
  - `refundUnrecordedOpening` tells staff to Re-sync for a lost race, and to record it outside the app for another currency.
  - `disputeOpening` is due at `evidenceDueBy`, else at `NOW`.
  - No opening sets `subjectId`, and no message contains an `@`.
- **`disputeAwaitingBankOpening`**: links to the dispute, uses route set `PaymentRefunding` and kind `dispute_awaiting_bank`, is due 75 days out, and sets `noDueSoon`.
- **Refund openings**
  - `refundRefusedOpening` and `refundReversedOpening` messages never offer to cancel.
  - The reversal has subject "Refund sent back by the bank", is due at `NOW`, and links to the refund.
- **Legal deadline suffix**
  - The optional third argument `{rule, day}` adds "Legal refund deadline (withdrawal): <day>."
  - A faulty item reads "refund now." with no date.
  - With no deadline, nothing is added.
- **Dispute identity**: both dispute to-dos are keyed by the dispute id, so two disputes on one payment get different open keys. The visible content stops partway through this section.

## Relationships
- `src/modules/shop-tasks/domain/openings.ts` is the unit under test (all the `*Opening` builders).
- `src/kernel/permissions.ts` supplies `PERMISSION_SETS`, used to check that every `routeSet` is a declared set.
- `src/types/index.ts` supplies `TaskKind` and `TaskLinkType`.
- `src/modules/tasks/index.ts` supplies `openKeyOf` and the `SystemOpening` type.
- `src/modules/tasks/domain/lifecycle.ts` and `src/modules/tasks/domain/system.ts` are neighbors in the dependency graph, but nothing visible here imports them directly.

## Notes
- The country list is deliberately hard-coded so the test can catch a change to the production constant.
- The `DAY_MS` doc comment is duplicated on `AGREED_PLUS_30`, where it is wrong.
- The country-matrix test carries a `@see` annotation pointing to the shop-tasks module documentation.
- The "not reported not reported" assertion pins the current message wording for missing amount and currency.
