---
source: src/modules/payments/model.ts
sha256: ad2e8c7cbf6ec0842616896d86d5def606d00314090b2fb729ed02d1a5b86bc5
generated_at: 2026-10-15T11:26:23.404783+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/model.ts

## Purpose

Defines the Mongoose schema, document interfaces, and serialization transform for the `payments` collection. One document per order (enforced by `unique` on `orderId`); the file also shapes the embedded `refunds` subdocuments and governs which fields reach the wire vs. stay internal.

## Key elements

- **`RefundLine`** — `{ productId, quantity }` pair identifying which product lines a refund covers (input to the credit note, never published).
- **`RefundRecord`** — One refund attempt (amount, currency, status, reason, idempotency key, optional `returnId`/`lines`/`shipping`, provider ref, failure code, settlement timestamp).
- **`PaymentDocument`** — Full document shape: `orderId`, `userId?`, `amount`, `currency`, `status`, `provider`, `providerRef?`, `cardLast4?`, `method`, `reference?`, `receivedAt?`, `refundedByHand?`, `amountRefunded`, `refunds[]`, timestamps.
- **`PaymentModel`** — `Model<PaymentDocument>` alias for consumers.
- **`refundSchema`** — Mongoose sub-schema for `RefundRecord`; uses `moneyPath` for `amount`/`shipping`.
- **`paymentSchema`** — Top-level Mongoose schema; `orderId` unique, `providerRef` unique+sparse, `amountRefunded` defaults to 0. Registers three compound indexes.
- **`REFUND_INTERNAL_KEYS`** — Const tuple of refund fields stripped before publishing (`_id`, `providerRefundRef`, `idempotencyKey`, `failureReason`, `lines`, `shipping`).
- **`wireRefund(refund)`** — Maps `_id`→`id` and deletes internal keys from one refund record.
- **`applyPaymentTransform`** — Built via `applySerialization`; omits `providerRef` at the top level and runs `wireRefund` over each embedded refund in the `after` hook.
- **`paymentModel`** — The exported Mongoose model instance (file truncated, but this is the final export).

## Relationships

- **`src/infrastructure/persistence/money-field.ts`** — Provides `moneyPath` (schema path helper) and `moneyPlugin` (Decimal128 ↔ number codec) used throughout the schema.
- **`src/infrastructure/persistence/serialize.ts`** — Provides `applySerialization`, the factory that produces `applyPaymentTransform`.
- **`src/modules/payments/repository.ts`** — Owns all queries; consumes `paymentModel` and `applyPaymentTransform` for lean-read normalization.
- **`src/modules/payments/presenter.ts`** — Re-attaches `providerRefundRef` and `failureReason` for staff-facing views (the model strips them).
- **`src/modules/payments/services/refunds.ts`** — Reads/writes the `refunds` array and `amountRefunded`; dispatches on `provider` for manual-refund flow.
- **`src/modules/payments/index.ts`** — Barrel re-export of the model and types.
- **`scenarios/flows/backdate.ts`** — Scenario/test that exercises the payment document (likely backdating `createdAt`/`settledAt`).

## Notes

- **`providerRef` is `unique` + `sparse`**: a payment exists momentarily before the provider assigns a ref; without `sparse`, every such document would collide on `null`.
- **`userId` is intentionally not `required`**: account erasure unsets the field rather than deleting the payment row.
- **Embedded-refund transform is manual**: Mongoose's lean-read path does not run a sub-schema's `toJSON` transform, so `applyPaymentTransform.after` loops over `refunds` explicitly. The same loop also covers the `toJSON` path where documents are already plain objects.
- **`orderId` unique constraint**: a retry after a decline re-confirms the *same* document instead of creating a second one.
- **Money fields** (`amount`, `shipping`, `amountRefunded`) are stored as Decimal128 via `moneyPath`; lean reads surface them as JS numbers.
- **`providerRef` is never published**: the contract declares `additionalProperties: false`, so letting it through would fail schema validation as well as leak an internal handle.
