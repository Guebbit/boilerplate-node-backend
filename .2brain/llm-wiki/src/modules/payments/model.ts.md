---
source: src/modules/payments/model.ts
sha256: 249cf25121794052b3c80ab753acac6c4b308e9b13ef37e07e5534d210329a87
generated_at: 2026-09-23T19:18:32.666169+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/model.ts

## Purpose

Defines the Mongoose schemas, interfaces, and serialization transforms for two collections: the **payment document** (one per order, keyed by `orderId`) and the **webhook event ledger** (idempotency guard against provider retries). It is the single source of truth for the persisted data shape of the payments module and the rules around what may leave the server via serialization.

## Key elements

- **`PaymentDocument`** – interface for a single payment row; carries `orderId`, `userId?`, `amount`, `currency`, `status`, `provider`, `providerRef?`, `cardLast4?`, `method`, `reference?`, `receivedAt?`, `refundedByHand?`.
- **`paymentSchema`** – Mongoose schema enforcing `unique` on `orderId` and `providerRef` (sparse), enum-constrained `status`/`method`, and `timestamps`.
- **`paymentModel`** – the registered Mongoose model (`'Payment'`).
- **`applyPaymentTransform`** – serialization wrapper (built via `applySerialization`) that renames `_id`→`id`, drops `__v`, and **omits `providerRef`** from every wire response.
- **`PaymentWebhookEventDocument`** / **`paymentWebhookEventSchema`** – minimal `{ eventId, receivedAt }` ledger; `eventId` is unique, `receivedAt` carries a 30-day TTL index so rows auto-expire.
- **`paymentWebhookEventModel`** – the registered model for the ledger.
- **`PaymentModel` / `PaymentWebhookEventModel`** – `Model<T>` type aliases for use in repository/service signatures.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** – imported as `applySerialization`; provides the base transform that `applyPaymentTransform` extends with the `providerRef` omission.
- **`src/types/index.ts`** – imported for `PaymentStatus` and `PaymentMethod` enums, which are used as schema `enum` constraints so the persisted values always match the shared contract.
- **`src/modules/payments/repository.ts`** – the sole consumer of the query-side of these models; the file's own comments delegate all queries here.
- **`src/modules/payments/services/refunds.ts`** – referenced in a comment explaining the `refundedByHand` flag: it is set only when a `manual` payment is refunded outside the app.

## Notes

- **One payment per order.** `orderId` is `unique`, so a retry after a decline upserts the same document rather than creating a second one.
- **`userId` is optional by design.** Account erasure unsets the ref (same convention as orders); the payment row is never deleted.
- **`providerRef` is sparse-unique.** Without `sparse`, pre-intent documents (provider not yet contacted) would all collide on `null`.
- **`providerRef` never reaches the wire.** It is stripped centrally in `applyPaymentTransform`; the OpenAPI contract declares `additionalProperties: false`, so leaking it would also be a spec violation.
- **Webhook ledger TTL.** The 30-day `expires` index means the collection self-cleans; the idempotency guarantee is only needed while the provider's retry window is open.
- **`refundedByHand`** is meaningful only for `provider: 'manual'` payments; it records that the operator returned funds outside the application.
