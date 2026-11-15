---
source: src/modules/payments/model.ts
sha256: 9a569be9f074a5b18ce6e7e4da0f2606d21585a987e2386879bf4e62c427e333
generated_at: 2026-11-14T21:00:55.432772+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/model.ts

## Purpose

Defines the Mongoose schema and document interfaces for the `payments` collection — one document per order, made a database fact by a unique index on `orderId`. It is the single source of truth for the payment lifecycle status (`PaymentStatus`), refund attempt records, dispute records, and the provider reference, so that the enum values on the wire and in the database cannot drift apart.

## Key elements

- **`PaymentDocument`** — the main document interface: `orderId` (unique), `userId?`, `amount`, `currency`, `status`, `provider`, `providerRef?`, `cardLast4?`, `method`, `amountRefunded`, `refunds[]`, `disputes[]`, `handledCancelEvents[]`, plus hand-recorded fields (`reference`, `receivedAt`, `transferReference`, `payBy`).
- **`RefundRecord`** — embedded sub-document per refund attempt. Carries its own `idempotencyKey`, `attempts`, `attemptedAt` (fence token), `nextAttemptAt`, `settledByHand`, `settledAt`, `reversedAt`, `reversedAfterSettling`, and optional `lines` / `shipping` for credit-note input.
- **`RefundLine`** — `{ productId, quantity }`; the minimal product-line data `invoicing` needs to look up a VAT rate. No cross-module reference.
- **`DisputeRecord`** — embedded, unique per `disputeRef`. Holds `kind`, `status`, `reason`, `fundsWithdrawn`, `evidenceDueBy`, `observedAt` (out-of-order fence), `dashboardUrl`.
- **`RefundSettlement`** — the payload a settlement write records: `providerRefundRef?`, `settledByHand?`, `attempt?` (fence token), `from?` (allowed source statuses for a hand settle).
- **`PaymentModel`** — `Model<PaymentDocument>` type alias; the actual Mongoose model is registered at the bottom of the file.
- **`refundSchema`** — the `Schema<RefundRecord>` instance with `moneyPath`, enums, and validation constraints.

## Relationships

- **`src/infrastructure/persistence/money-field.ts`** — provides `moneyPath` and `moneyPlugin`, used to type monetary fields as decimal strings with non-negative validation.
- **`src/infrastructure/persistence/serialize.ts`** — provides `applySerialization`, applied to the schema so documents serialize consistently (money, dates, enums) when they leave the process.
- **`src/modules/payments/repository.ts`** — owns all queries against this model; the model file contains no query logic (noted in the `PaymentModel` doc comment).
- **`src/modules/payments/services/refund-settlement.ts`** — reads/writes `RefundRecord` fields (`status`, `settledAt`, `providerRefundRef`, `attemptedAt`) when settling or failing a refund attempt.
- **`src/modules/payments/services/disputes.ts`** — upserts `DisputeRecord` entries on the document when the provider reports a dispute.
- **`src/modules/payments/services/external-refunds.ts`** — opens new `RefundRecord` entries on the hand-settled or provider-refused paths.
- **`src/modules/payments/services/intent.ts`** — creates the initial payment document and transitions `status` through the provider lifecycle.
- **`src/modules/payments/services/effects.ts`** — applies side-effect writes such as `amountRefunded` increments and `handledCancelEvents` appends to the document.
- **`src/modules/payments/services/notify.ts`** — reads document state to decide what notifications to emit.
- **`src/modules/payments/services/offline.ts`** — handles offline/hand-settled payment recording against this document.
- **`src/modules/payments/services/announce.ts`** — publishes domain events derived from document transitions.
- **`src/modules/payments/services/list.ts`** — reads documents for staff-facing list views.
- **`src/modules/payments/presenter.ts`** — shapes the document into the wire payload, stripping fields marked "never published" (`providerRef`, `lines`, `attempts`).
- **`src/modules/payments/index.ts`** — barrel export; re-exports the model, interfaces, and `PaymentModel` type.
- **`scenarios/flows/backdate.ts`** — test/flow scenario that manipulates `createdAt` / `settledAt` timestamps on the document to simulate time passage.

## Notes

- **Fence-token pattern**: `attemptedAt` on a `RefundRecord` acts as a compare-and-swap token. A settle or failure write must match on the same `attemptedAt` value, so a slow stale attempt cannot overwrite a newer one. The same pattern appears in `RefundSettlement.attempt`.
- **`amountRefunded` is incremented at refund-open time**, not at settlement. This is what prevents two racing partial refunds from exceeding the original payment.
- **`handledCancelEvents`** is an idempotency log for `order.canceled` outbox events. A redelivered event finds its id here and is a no-op, even if staff voided the original refund in the meantime.
- **`reversedAt` is set once and never cleared.** Once a refund is reversed, the sweep will not resend it; a redelivered provider report finds nothing left to change.
- **`userId` is unset (not nulled) when the account is erased**, mirroring the `orders` convention. No other PII is stored on the payment document.
- **`providerRef` is unique-indexed** and is the webhook's sole lookup key. Two payments answering to one reference would settle the wrong order, which is why uniqueness is enforced at the DB level.
- **Enum values come from `@types`** (the shared contract), not from local string literals, so the DB enum and the wire vocabulary stay in lockstep.
