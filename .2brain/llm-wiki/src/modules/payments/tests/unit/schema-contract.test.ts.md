---
source: src/modules/payments/tests/unit/schema-contract.test.ts
source_sha256: 6b208d3147d7ea9e57a48e643d2c410b6db992d71a163c501e079dcda3d3c689
context_sha256: c4529677551d9e41b30e094a4f79d5db0d5af80f513215dba6a76a59003409e2
generated_at: 2026-11-22T07:06:30.005042+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/unit/schema-contract.test.ts

## Purpose
Unit test that pins the contract of `paymentSchema`. Its central concern is idempotence: `orderId` must carry `unique: true`, so the database allows at most one payment per order and a retried intent (double-click, replayed webhook) fails on insert instead of creating a second charge. Removing it throws nothing, so this test is the only guard.

## Key elements
- **`describe('paymentSchema')`** with seven tests:
  - **Required paths**: exactly `amount`, `amountRefunded`, `currency`, `method`, `orderId`, `provider`. `cardLast4` (not every provider has a card), `status` (has a default) and `userId` (unset on account erasure) are intentionally not required.
  - **Unique order index**: `indexOptionSpecs` contains `orderId_1: unique=true`.
  - **References**: `orderId` is an `ObjectId` ref to `Order`; `userId` is an `ObjectId` ref to `User`.
  - **Amount validation**: `amount` refuses `-0.01` but accepts `0`.
  - **Decimal storage**: `amount` and `amountRefunded` are `Decimal128`; `amountRefunded` defaults to `'0'`.
  - **Status**: enum equals `Object.values(PaymentStatus)`; default is `PaymentStatus.requires_confirmation`, so a new payment never looks paid.
  - **Timestamps**: `timestamps` option is `true`.

## Relationships
- **`src/modules/payments/model.ts`**: supplies `paymentSchema`, the only thing under test.
- **`src/types/index.ts`**: supplies the `PaymentStatus` enum, imported via the `@types` alias, used for the status enum and default checks.
- **`tests/support/schema.ts`**: supplies the schema-introspection helpers (`requiredPaths`, `indexOptionSpecs`, `typeOf`, `refOf`, `refuses`, `enumOf`, `defaultOf`, `optionsOf`), imported via the `@tests/schema` alias.

## Notes
- The tests inspect the schema definition and do not touch a database. The uniqueness check reads index specs, so it does not exercise an actual duplicate insert.
- The required-paths assertion is an exact list. Adding or removing a required field in the model means updating it.
- Decimal128 is used so database-side sums are exact. A negative amount is rejected because it would act as an unaudited refund.
