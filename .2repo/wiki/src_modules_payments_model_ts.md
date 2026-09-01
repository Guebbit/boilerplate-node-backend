# src/modules/payments/model.ts

## Purpose

Defines the Mongoose schema, document interface, and model for the Payment collection. It enforces a 1:1 relationship between a payment and its order (via `unique` on `orderId`), captures the provider-facing lifecycle status, and exposes a lean-read serialization transform for the repository layer.

## Key elements

- **`PaymentDocument`** – Mongoose `Document` interface describing the stored shape: `orderId`, `userId`, `amount`, `currency`, `status`, `provider`, `cardLast4`, timestamps.
- **`PaymentModel`** – Convenience type alias for `Model<PaymentDocument>`; imported by `repository.ts` rather than re-declared there.
- **`paymentSchema`** – The Mongoose `Schema` instance. `orderId` is `unique: true` so a retry upserts the same document. `status` defaults to `PaymentStatus.requires_confirmation` and is constrained to the enum's values. `timestamps: true` adds `createdAt`/`updatedAt`.
- **`applyPaymentTransform`** – Result of `applySerialization(paymentSchema)`. Normalizes lean query output (`_id` → `id`, strips `__v`). Consumed by the repository factory for lean reads.
- **`paymentModel`** – The registered Mongoose model (`'Payment'`). This is the handle the repository uses for all CRUD and query operations.

## Relationships

- **`src/types/index.ts`** — Imports `PaymentStatus` (the enum). The schema's `enum` array and `default` are derived from it, keeping the stored value and the wire contract in lockstep.
- **`src/infrastructure/persistence/serialize.ts`** — Provides `applySerialization`, which this file calls with `paymentSchema` to produce `applyPaymentTransform`.
- **`src/modules/payments/repository.ts`** — Imports `paymentModel` and `applyPaymentTransform`; all queries and lean-read normalization live there.
- **`src/modules/payments/service.ts`** — Business rules (state transitions, retry semantics) reference the `PaymentStatus` values persisted by this schema.
- **`src/modules/payments/tests/unit/schema-contract.test.ts`** — Asserts that the schema's fields, constraints, and enum values match the `PaymentDocument` interface and `PaymentStatus` contract.

## Notes

- The `unique` index on `orderId` is the idempotency guarantee: a re-authorization or retry after a decline upserts the same document rather than creating a second. Consumers should expect `findOneAndUpdate` (upsert) semantics on the repository, not blind `create`.
- `currency` is stored per-document (frozen at intent time) rather than read from config at read time, so changing `NODE_DEFAULT_CURRENCY` later does not retroactively alter historical payments.
- `cardLast4` is the only card data persisted; full PANs must never be written to this collection.
- The `provider` field is a free-form string (e.g. `'fake'`, `'stripe'`), not an enum—adding a new provider requires no schema migration.
