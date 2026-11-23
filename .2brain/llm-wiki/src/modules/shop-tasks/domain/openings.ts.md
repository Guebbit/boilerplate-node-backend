---
source: src/modules/shop-tasks/domain/openings.ts
source_sha256: 9b50d6fca0b8721e532ecb6a2e929d3721562280b83c8c84fa8eb201657b7445
context_sha256: b157da8a41efdce1d14a3c655c34878324373274cdcb7f62d52c47d5b9b5198d
generated_at: 2026-11-22T07:41:03.282045+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop-tasks/domain/openings.ts

## Purpose
Pure data module that maps shop situations (payment, refund, return and stock events) to the first facts of a staff task: the kind, the linked record, the permission set that works it, an English inbox subject and message, and a due date. It does no I/O. The `tasks` service supplies the dedup key and does the write. Texts carry ids only, never names or addresses, because they sit in the inbox of every holder of the routed set.

## Key elements
- `ShopOpening`: interface for a task's first facts (`kind`, `routeSet`, `link`, `subject`, `message`, `dueAt`, optional `noDueSoon`). It restates `tasks`' `SystemOpening` without `work` and `subjectId`.
- `FTC_JURISDICTIONS`: exported const tuple of country codes (`US`, `PR`, `GU`, `VI`, `AS`, `MP`) where 16 CFR 435 binds a seller.
- `refundOwedOpening(refund, dueAt)`: a refund of a hand-recorded payment (`manual_refund_owed`). Routed to `PaymentRefunding` and linked to the refund.
- `AmountMismatchFacts`: structural copy of the `payment.amount_mismatch` event payload.
- `amountMismatchOpening(payment, dueAt)`: a provider success that is not the frozen payment (`amount_mismatch`). Routed to `AuditDisplay` (administrators only) and linked to the payment. The message names the differing fields and next steps. It words the refund differently when the provider reported no amount.
- `refundUnrecordedOpening(refund, dueAt)`: a refund made in the provider's dashboard that the import could not record (`refund_unrecorded`). Routed to `PaymentRefunding` and linked to the payment. The advice differs for `lost_race` versus `other_currency`.
- `returnRefundShortOpening(short, dueAt)`: a return refund smaller than owed (`return_refund_short`). Routed to `ReturnReceiving` and linked to the return. The text differs for `no_payment` versus `used_up`.
- `paidWithoutHoldOpening(orderId, now)`: a paid order with no stock set aside (`paid_without_hold`). Routed to `InventoryManagement` and linked to the order. It computes its own `dueAt` as `now` + 4 hours.
- `LegalDeadline`: `{ rule: RefundDueRule; day: string }`, the legal refund deadline shown in a to-do.
- Internal helpers: `legalDeadlineNote` (appends a withdrawal date, or "refund now" for a faulty item) and `disputeAdvice` (extra text when the refund failure reason is `disputed`). Both return an empty string when they do not apply. `reported` renders a missing figure as "not reported".
- Constants: `ORPHAN_WINDOW_MS` (4 h), `AWAITING_BANK_MS` (75 days) and `FTC_GRACE_MS` (30 days, FTC 16 CFR 435.2). The excerpt shows no use of the last two.

The file continues past the shown portion with more openings built on these helpers; they are not covered here.

## Relationships
- `src/types/index.ts`: supplies the `TaskKind`, `TaskLinkType`, `RefundDueRule` and `RefundFailureReason` enums used to build openings. `PermissionSetName` comes from `@api/permission-vocabulary`.
- `src/domain-primitives/time.ts`: supplies `DAY_MS` and `HOUR_MS` for the due-window constants.
- `src/modules/shop-tasks/services/tasks.ts`: consumes the openings. It adds the staff screen, passes the result to `tasks` (where the compiler checks it matches `SystemOpening`), and passes real event payloads in as `AmountMismatchFacts`.
- `src/modules/shop-tasks/domain/index.ts`: the domain barrel for this module.
- `src/modules/shop-tasks/tests/unit/openings.test.ts`: unit tests for these builders.

## Notes
- The types `ShopOpening` and `AmountMismatchFacts` are declared structurally rather than imported, because a domain file may not import a sibling module or the kernel's event map. The compiler checks the match at the service boundary.
- Most builders take `dueAt` from the caller. `paidWithoutHoldOpening` is the exception and derives it from `now`.
- Message text is English only and must stay free of names and addresses.
