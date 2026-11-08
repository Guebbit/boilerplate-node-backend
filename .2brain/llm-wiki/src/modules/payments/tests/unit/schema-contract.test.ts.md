---
source: src/modules/payments/tests/unit/schema-contract.test.ts
sha256: acd9cb17e53e178adada32366dc3ee4420ba9a0a5cfea80900dca86bb16c324a
generated_at: 2026-11-08T07:41:08.024175+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/schema-contract.test.ts

## Purpose

Locks down the payment schema's contract as a set of executable assertions: required fields, the `unique` index on `orderId` (the module's entire idempotence guarantee), reference integrity, type choices, enum bounds, and safe defaults. It exists so that a schema change that silently breaks any of these invariants fails CI instead of letting the shop charge an order twice.

## Key elements

- **`describe('paymentSchema')`** — single block; every assertion is one `it` tied to one contract property.
- **Required-fields test** — asserts exactly `[amount, amountRefunded, currency, method, orderId, provider]`; documents why `cardLast4` and `userId` are intentionally absent.
- **Unique-index test** — asserts `orderId_1: unique=true` via `indexOptionSpecs`, the single line that makes retried intents fail on insert rather than create a duplicate.
- **Reference test** — asserts `orderId → Order` and `userId → User` are `ObjectId` refs.
- **Negative-amount test** — asserts `-0.01` is refused, `0` is allowed.
- **Decimal test** — asserts `amount` and `amountRefunded` are `Decimal128`; `amountRefunded` defaults to `'0'`.
- **Status test** — asserts the enum equals `Object.values(PaymentStatus)` and the default is `PaymentStatus.requires_confirmation`.
- **Timestamps test** — asserts `timestamps: true` on the schema options.

## Relationships

- **`src/modules/payments/model.ts`** — provides `paymentSchema`, the sole object under test.
- **`src/types/index.ts`** — provides `PaymentStatus`; the test compares the schema's enum against its `Object.values` to catch drift.
- **`tests/support/schema.ts`** — provides the assertion helpers (`requiredPaths`, `indexOptionSpecs`, `typeOf`, `refOf`, `refuses`, `enumOf`, `defaultOf`, `optionsOf`) that this file (and presumably sibling schema-contract tests) use as a shared DSL.

## Notes

- The file-header comment is the canonical warning: removing `unique: true` on `orderId` produces no error at runtime — the shop simply becomes able to charge twice. Treat that index as load-bearing.
- `userId` is *not* required and *not* nullable-optional; it is set to `null` on account erasure, mirroring the `orders` module's convention.
- `method` is required even though some code paths might not have it; the comment asserts every creation path sets it, so a missing value would be a bug, not a valid state.
- The zero-amount allowance (`0` passes, `-0.01` does not) means the schema intentionally permits a zero-value record (e.g., a free/granted order) but blocks accidental refunds routed through the payment insert path.
