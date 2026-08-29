# src/modules/payments/model.ts

## Purpose

Defines the Mongoose schema, document interface, and model for the `Payment` collection. Enforces a one-payment-per-order invariant (via `unique` on `orderId`) so that retries after a decline re-confirm the same document rather than creating duplicates. The status field tracks the provider-facing money lifecycle, distinct from the order's customer-facing status.

## Key elements

- **`PaymentDocument`** – Mongoose `Document` interface: `orderId`, `userId`, `amount`, `currency`, `status`, `provider`, `cardLast4?`, `createdAt?`, `updatedAt?`.
- **`PaymentModel`** – Type alias for `Model<PaymentDocument>`; the shape the repository imports.
- **`paymentSchema`** – Mongoose `Schema` with `unique: true` on `orderId`, `enum` + `default` on `status` sourced from `PaymentStatus`, `timestamps: true`, and `min: 0` on `amount`.
- **`applyPaymentTransform`** – Serialization hook (`applySerialization(paymentSchema)`) that renames `_id` → `id` and strips `__v` on lean reads.
- **`paymentModel`** – The registered Mongoose model instance (`model('Payment', paymentSchema)`).

## Relationships

- **`@infrastructure/persistence/serialize`** – Imports `applySerialization`, which `applyPaymentTransform` delegates to for document normalization.
- **`@types` (types/index.ts)** – Imports `PaymentStatus`; the schema's `enum` is `Object.values(PaymentStatus)`, keeping the DB constraint and the wire contract in lockstep.
- **`./repository`** – Consumes `paymentModel` and `applyPaymentTransform` to issue queries and shape results (per the file's own doc comment).
- **`./service`** – Depends on the repository and the status vocabulary defined here to implement confirm/decline/refund business rules.

## Notes

- `orderId` is both `required` and `unique`; this is the file's core invariant. A second insert for the same order will reject at the DB level.
- `status` defaults to `requires_confirmation`; `declined` is explicitly retryable (the confirm endpoint re-accepts it), while `refunded` is terminal.
- `currency` is stored per document rather than read from config at read time, so historical payments remain correct if `NODE_DEFAULT_CURRENCY` changes.
- `cardLast4` is the only card data persisted; the doc comment calls it "the only card digits a payment system may remember."
- The `provider` field is a free-form string (`'fake'` in the demo, `'stripe'` in production) with no enum constraint.
