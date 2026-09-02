# src/modules/payments/model.ts

## Purpose

Defines the Mongoose schema, document interface, and registered model for the **Payment** collection. Enforces the one-payment-per-order invariant via a `unique` index on `orderId`, so a retry after a decline re-confirms the same document. Anchors the provider-facing lifecycle (`PaymentStatus` enum from `@types`) to the schema so the wire and the enum cannot drift.

## Key elements

- **`PaymentDocument`** – Interface extending Mongoose `Document`. Fields: `orderId` (unique ref → Order), `userId` (optional ref → User, unset on erasure), `amount`, `currency`, `status` (`PaymentStatus`), `provider`, `cardLast4?`, timestamps.
- **`PaymentModel`** – Type alias for `Model<PaymentDocument>`; used as the model generic.
- **`paymentSchema`** – Mongoose `Schema` instance. `status` defaults to `PaymentStatus.requires_confirmation` and is constrained by `Object.values(PaymentStatus)`. `userId` is intentionally **not** `required` so account erasure unsets it without deleting the payment.
- **`applyPaymentTransform`** – Wraps `applySerialization(paymentSchema)` (from `@infrastructure/persistence/serialize`). Normalizes lean query results: renames `_id` → `id`, strips `__v`. Consumed by the repository's factory.
- **`paymentModel`** – The registered Mongoose model (`model<PaymentDocument, PaymentModel>('Payment', …)`). The single import point for the runtime model instance.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** – Provides `applySerialization`, which is called with `paymentSchema` to produce `applyPaymentTransform`.
- **`src/modules/payments/repository.ts`** – Owns all query/read/write logic against `paymentModel`; imports the model and the transform.
- **`src/modules/payments/service.ts`** – Encapsulates business rules (status transitions, retry-after-decline, refund). Consumes the repository; does not import the schema directly.
- **`src/types/index.ts`** – Source of the `PaymentStatus` enum used for the `status` field's `enum` constraint and its default value.
- **`src/modules/payments/tests/unit/schema-contract.test.ts`** – Asserts the schema contract (required fields, enum values, `unique` index on `orderId`).
- **`src/modules/payments/tests/integration/retention.test.ts`** – Exercises the erasure path that unsets `userId` while preserving the payment document.

## Notes

- `userId` is deliberately absent after account erasure; code must treat it as optional everywhere (no non-null assertion).
- `amount` and `currency` are **frozen at intent-creation time**; they do not track live order totals or `NODE_DEFAULT_CURRENCY` changes.
- `cardLast4` is the only card data persisted—never store full PANs.
- Queries and mutation logic are **not** in this file; they live in `repository.ts` and `service.ts` respectively. This file is schema + registration only.
