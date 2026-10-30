---
source: src/modules/payments/model.ts
sha256: 7d215d28a8a253b4c89e1b4802047652117690a349d29011b4e77699e14459e5
generated_at: 2026-10-29T05:06:51.218529+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/model.ts

## Purpose

Defines the Mongoose schema, TypeScript document interface, and embedded sub-document types for the payment record. One document per order (enforced by a unique index on `orderId`), it persists the provider-facing payment lifecycle, all refund attempts, and all buyer-bank disputes. It is the single source of truth that `repository.ts` queries and `services/*` mutate.

## Key elements

- **`RefundLine`** – minimal product-line shape (`productId`, `quantity`) for credit-note generation.
- **`RefundRecord`** – one refund attempt: amount, status, idempotency key, retry bookkeeping (`attempts`, `attemptedAt`, `nextAttemptAt`), settlement/reversal timestamps, and optional `lines`/`shipping` for invoicing.
- **`DisputeRecord`** – one provider-reported buyer-bank dispute, keyed by `disputeRef`, with an `observedAt` fence for out-of-order reports.
- **`RefundSettlement`** – the payload a settle/fail write carries: provider ref, hand-settle flag, and the attempt fence token it must match.
- **`PaymentDocument`** – top-level interface extending Mongoose `Document`; fields include `orderId`, `userId`, `amount`/`currency`, `status`, `provider`, `providerRef`, `method`, `amountRefunded`, `refunds[]`, `disputes[]`.
- **`PaymentModel`** – exported `Model<PaymentDocument>` type alias for repository signatures.
- **`refundSchema` / `disputeSchema`** – embedded Mongoose schemas for the sub-documents above.
- **`paymentSchema`** (exported) – the root Mongoose schema; registers `moneyPlugin`, `applySerialization`, and the unique index on `orderId`.

## Relationships

- **`src/infrastructure/persistence/money-field.ts`** – imports `moneyPath` (field definition helper) and `moneyPlugin` (schema-level plugin) to declare all currency-amount fields.
- **`src/infrastructure/persistence/serialize.ts`** – imports `applySerialization` to attach wire-serialization rules to the schema.
- **`src/modules/payments/repository.ts`** – consumes `PaymentModel` / `PaymentDocument` types for all CRUD and query operations.
- **`src/modules/payments/services/refund-settlement.ts`** – reads/writes `RefundRecord` entries and produces `RefundSettlement` payloads.
- **`src/modules/payments/services/disputes.ts`** – upserts `DisputeRecord` entries keyed on `disputeRef`.
- **`src/modules/payments/services/intent.ts`** – creates or re-confirms the `PaymentDocument` on the intent path.
- **`src/modules/payments/presenter.ts`** – projects the document shape into API responses (hides `providerRef`, `idempotencyKey`, `lines`, `shipping`, `disputes` from client wire).
- **`src/modules/payments/index.ts`** – barrel re-exports of the model's public types.
- **`scenarios/flows/backdate.ts`** – test/scenario flow that exercises payment document creation and status transitions.

## Notes

- **Uniqueness contract:** `orderId` is indexed unique. A retry after decline *re-confirms* the same document; it never creates a second row.
- **`providerRef`** is indexed unique and is the webhook lookup key. It is **never published** on the client wire.
- **`amountRefunded`** increments the moment a refund is *opened* (not settled), which is what prevents two racing partial refunds from over-refunding.
- **`attemptedAt`** on a `RefundRecord` is a fence token: a settle or fail write only lands if the record is still `pending` *and* carries the same `attemptedAt`. A stale slow attempt cannot overwrite a newer one.
- **`reversedAt`** is set once and never cleared; the sweep will never resend a reversed refund.
- **`userId`** is unset (not deleted) when the account is erased, mirroring the `orders` convention.
- **`transferReference`** is retained even after the payment is cancelled or the buyer switches to card — a late bank transfer is matched back by it.
- **`disputes`** are staff-only on the wire; the presenter must exclude them from client responses.
- **Money fields** all go through `moneyPath` from the infrastructure layer; do not declare plain `Number` types for amounts.
