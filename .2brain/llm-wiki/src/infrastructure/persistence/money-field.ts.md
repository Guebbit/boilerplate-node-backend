---
source: src/infrastructure/persistence/money-field.ts
sha256: 46863b9416647a8c22ae3d0dfddb6c3dfea8b938d3f1ccd618ca74361267d586
generated_at: 2026-10-14T08:10:00.059839+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/money-field.ts

## Purpose

Bridges the gap between MongoDB's `Decimal128` storage (required for exact money) and the application's plain `number` wire format. Provides the Mongoose schema-path definition, a lean-query post-hook, and a recursive `toJSON` transform so that every layer above persistence sees an ordinary `number`, regardless of how the document was read.

## Key elements

- **`moneyPath(options?)`** – Returns a Mongoose schema-path definition that stores `Decimal128`, casts a written `number` on save, and exposes a `number` via a getter. Accepts `required`, `nonNegative`, and `default`.
- **`moneyPlugin(schema)`** – Mongoose plugin that registers `post` hooks on `find`, `findOne`, `findOneAndUpdate`, `findOneAndDelete`, and `findOneAndReplace`; when the query was called with `.lean()`, it runs `reviveDecimals` on the result in place.
- **`reviveDecimals(value)`** – Recursively walks plain objects and arrays, replacing every `Decimal128` with its `number` equivalent **in place**; returns the same reference.
- **`decimalToNumber(value)`** – Converts a single `Decimal128` (or already-numeric) value to `number`; returns `undefined` for absent fields.
- **`MoneyPathOptions`** – Interface: `{ required?, nonNegative?, default? }`.
- Internal: `isDecimal128`, `isWalkable`, `isWritableAmount`, `DECIMAL128_FOR_NUMBER_FIELD` (type-narrowing cast for Mongoose's `type` field).

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** – Calls `reviveDecimals` as its `toJSON` transform so serialized documents emit numbers.
- **`src/modules/invoicing/model.ts`, `orders/model.ts`, `payments/model.ts`, `products/model.ts`, `returns/model.ts`** – Each defines one or more monetary fields using `moneyPath` and registers `moneyPlugin` on its schema.
- **`src/modules/payments/repository.ts`** – Reads and writes payment documents whose money fields are governed by this module; relies on the `number` contract for all arithmetic.
- **`tests/integration/persistence/money-field.test.ts`** – Integration tests exercising write/read round-trips and lean-query behavior.
- **`tests/unit/infrastructure/persistence/money-field.test.ts`** – Unit tests for `decimalToNumber`, `reviveDecimals`, and the validation logic.

## Notes

- No setter is needed on `moneyPath`; Mongoose natively casts a written `number` to `Decimal128`.
- Aggregation results are deliberately **not** hooked — a `$sum` pipeline keeps its `Decimal128` precision until the caller explicitly reads it as minor units.
- `isDecimal128` checks the `_bsontype` property rather than `instanceof`, avoiding breakage when two copies of the BSON library are present.
- `reviveDecimals` mutates the document in place and returns the same object; it does not clone.
- The `DECIMAL128_FOR_NUMBER_FIELD` cast is the single, documented place where `Decimal128` is coerced to `NumberConstructor` to satisfy Mongoose's type definitions for `number`-typed fields.
