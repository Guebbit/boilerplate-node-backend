---
source: src/modules/payments/tests/unit/schema-contract.test.ts
sha256: c26bae8f05ebd728be45e1e1ef4e2831d81b55d423a79e8a08e557e162f2a904
generated_at: 2026-10-15T11:39:20.798123+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/schema-contract.test.ts

## Purpose

Contract test for the `paymentSchema` Mongoose model. It asserts the schema's declared shape — required fields, indexes, reference types, value constraints, numeric types, enum restriction, and defaults — so that any silent drift in the model definition fails the suite. The file's header comment frames the unique index on `orderId` as the module's entire idempotence guarantee.

## Key elements

- **`describe('paymentSchema')`** — single suite; no helper classes or exported symbols.
- **Required-paths assertion** — locks the six mandatory fields (`amount`, `amountRefunded`, `currency`, `method`, `orderId`, `provider`) and documents why `cardLast4`, `status`, and `userId` are absent.
- **Index assertion** — verifies the `orderId_1: unique=true` index exists.
- **Reference assertions** — confirms `orderId` and `userId` are `ObjectId` refs pointing to `Order` and `User` respectively.
- **Negative-amount guard** — asserts the schema rejects `-0.01` but accepts `0`.
- **Decimal128 assertions** — both `amount` and `amountRefunded` are `Decimal128`; `amountRefunded` defaults to `0`.
- **Status enum + default** — `status` is restricted to `PaymentStatus` values and defaults to `requires_confirmation`.
- **Timestamps** — `timestamps: true` is present.

## Relationships

- **`src/modules/payments/model.ts`** — the system under test; `paymentSchema` is imported and every assertion inspects it.
- **`src/types/index.ts`** — provides the `PaymentStatus` enum used to validate the schema's `status` enum values and default.
- **`tests/support/schema.ts`** — supplies all contract-test primitives (`requiredPaths`, `indexOptionSpecs`, `typeOf`, `refOf`, `refuses`, `defaultOf`, `enumOf`, `optionsOf`) that make the assertions declarative.

## Notes

- `cardLast4` is intentionally **not** required — providers without card data (and the test fake) cannot supply digits.
- `userId` is intentionally **not** required — GDPR account-erasure unsets it, matching the `orders` convention.
- `status` is not required because it carries a schema-level default; its absence from `requiredPaths` is correct.
- The negative-amount test uses `-0.01`, not a large negative value, to mirror the real failure mode (a refund issued through the charge path).
- All numeric monetary fields are `Decimal128`, not `Number`, to keep database-side sums exact.
