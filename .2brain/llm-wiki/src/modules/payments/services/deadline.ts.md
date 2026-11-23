---
source: src/modules/payments/services/deadline.ts
source_sha256: 199efb0320ad01a3a2933f442fb9750e089ffc09cc530e0b50b51043bb47ae08
context_sha256: f3641e3ca2e194edcc4f5e8a579a35f9d5de026cc7cc3d1a01b11775cfd058db
generated_at: 2026-11-22T06:49:19.396727+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/services/deadline.ts

## Purpose
Exposes the legal deadline of a withdrawal or return refund, together with the rule that sets it. The `tasks` module reads it to date the work it opens and to explain why. If the law sets no deadline for a refund, nothing is returned here and the caller chooses its own.

## Key elements
- `refundLegalDue(paymentId, refundId): Promise<RefundDue | undefined>`: loads the payment through the payment repository, finds the refund whose `_id` (stringified) equals `refundId`, and returns `{ dueBy, dueRule }`. It returns `undefined` if the payment or refund is missing, if the refund has no `dueRule`, or if `refundDueBy` yields no date.

## Relationships
- `src/modules/payments/domain/index.ts`: supplies `refundDueBy` (computes the deadline from a refund record) and the `RefundDue` type (the return shape).
- `src/modules/payments/repository.ts`: supplies `paymentRepository`, whose `findById` is used to fetch the payment and its embedded `refunds`.
- The module doc says `tasks` is the consumer. This file does not import it.

## Notes
- The deadline is the one "as it was stamped when the record opened". The stored `dueRule` on the refund must be present, and `refundDueBy` must also return a value, for a result to come back.
- `undefined` covers several cases (no legal deadline, missing payment, missing refund), so callers cannot tell them apart.
