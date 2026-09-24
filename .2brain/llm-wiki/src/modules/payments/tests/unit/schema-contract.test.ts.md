---
source: src/modules/payments/tests/unit/schema-contract.test.ts
sha256: 43e0497ba25d529897e4ff3b8b612b669f1d44096949a6dd95c20b253b0b0c02
generated_at: 2026-09-23T19:24:56.645810+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/schema-contract.test.ts

## Purpose

Unit test that pins down the payment schema's contract: required fields, the unique index that guarantees at-most-one-payment-per-order, field types and references, numeric bounds, the status enum with its safe default, and timestamp options. It serves as both a regression test and the canonical record of the module's idempotence guarantee.

## Key elements

- **`describe('paymentSchema')`** — six assertions covering the full schema contract:
  - **Required paths** — asserts `amount`, `currency`, `method`, `orderId`, `provider` are mandatory; documents why `cardLast4`, `status`, and `userId` are intentionally optional.
  - **Unique index** — asserts `orderId` carries `unique: true`, the sole mechanism preventing duplicate charges on replayed intents.
  - **ObjectId references** — asserts `orderId → Order` and `userId → User` are real Mongoose refs.
  - **Amount floor** — asserts `min: 0` to block negative charges (refunds must go through the refund path).
  - **Status enum + default** — asserts the enum matches `PaymentStatus` values and the default is `requires_confirmation` (no money has moved yet).
  - **Timestamps** — asserts `timestamps: true` is enabled.

## Relationships

- **`src/modules/payments/model.ts`** — source of `paymentSchema`, the system under test.
- **`src/types/index.ts`** — provides the `PaymentStatus` enum used to validate the status field's allowed values and default.
- **`tests/support/schema.ts`** — provides the introspection helpers (`requiredPaths`, `indexOptionSpecs`, `typeOf`, `refOf`, `pathOptions`, `enumOf`, `defaultOf`, `optionsOf`) that extract schema metadata for assertion.

## Notes

- The module doc comment is the authoritative statement of the idempotence story: removing the `unique` index causes no error but silently permits double-charging.
- `userId` is optional by design — account erasure nulls it (same treatment as `orders.userId`). This is a semantic choice, not an oversight.
- `method` is required because every creation path (intent or manual recording) sets it; a row without it would be uninterpretable.
- Tests assert against extracted schema metadata (via the shared helpers) rather than instantiating documents, so they verify *declaration* not *runtime behaviour*.
