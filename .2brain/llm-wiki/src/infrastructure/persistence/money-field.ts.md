---
source: src/infrastructure/persistence/money-field.ts
sha256: b914e09f25ea462de37a00c9763b5564a1ea10b12368fe2157c3561eff71093d
generated_at: 2026-10-29T02:13:20.337487+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/money-field.ts

## Purpose

Bridges MongoDB's `Decimal128` (the on-disk representation of monetary values) and the plain `number` that every layer above persistence expects. It provides a reusable Mongoose schema-path factory, a recursive Decimal128→number reviver, and a query middleware so that neither hydrated documents, lean queries, nor serialised output ever leak a raw `Decimal128` object to application code.

## Key elements

- **`decimalToNumber(value)`** — Single-value converter. Returns the decimal `number` for a `Decimal128` or an already-numeric value; `undefined` for anything else (e.g. a missing field).
- **`reviveDecimals(value)`** — In-place, recursive walk that replaces every nested `Decimal128` with its `number` equivalent. Handles plain objects and arrays; ignores `ObjectId`, `Date`, `Buffer`, etc.
- **`moneyPath(options?)`** — Factory returning a Mongoose path definition. Sets `type: Decimal128`, a `get` that calls `decimalToNumber`, a finite/non-negative validator, and an optional `default`. Options: `required`, `nonNegative`, `default`.
- **`moneyPlugin(schema)`** — Registers a `post` hook on `find`, `findOne`, `findOneAndUpdate`, `findOneAndDelete`, `findOneAndReplace`. When the query was `.lean()`, it runs `reviveDecimals` on the result.
- **`MoneyPathOptions`** (interface) — `required`, `nonNegative`, `default` fields accepted by `moneyPath`.
- Internal helpers: `isDecimal128` (checks the `_bsontype` tag), `isWalkable` (plain-object/array guard), `isWritableAmount` (finite + optional ≥ 0 check).

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** — The module docstring identifies `reviveDecimals` as the transform the serializer applies during `toJSON`, so serialize.ts imports it to handle non-lean document serialisation.
- **`src/modules/{invoicing,orders,payments,products,returns}/model.ts`** — Each domain model's Mongoose schema defines its monetary fields (price, total, amount, etc.) via `moneyPath`, consuming the exported factory and its options.
- **`src/modules/payments/repository.ts`** — Uses lean queries against the payments schema; the `moneyPlugin` post-find hook ensures the numbers it reads back are plain `number`s rather than `Decimal128`.
- **`tests/unit/infrastructure/persistence/money-field.test.ts`** — Unit tests for `decimalToNumber`, `reviveDecimals`, `moneyPath` validation, and `moneyPlugin` lean-revival.
- **`tests/integration/persistence/money-field.test.ts`** — Integration tests exercising the full write→read cycle (hydrated getter, lean hook, toJSON path) against a real MongoDB instance.

## Notes

- `isDecimal128` checks the `_bsontype` property string rather than using `instanceof`, so it works regardless of which copy of the BSON library constructed the value (avoids dual-package issues).
- The `DECIMAL128_FOR_NUMBER_FIELD` cast exists because Mongoose's type definitions only accept `Number` for a `number`-typed document field; the cast is confined to this one spot.
- Aggregation pipelines are intentionally **not** hooked by `moneyPlugin`. A `$sum` on `Decimal128` values stays exact; the caller is expected to read the result as minor units.
- The validation error message is a function (not a string) because Mongoose's function-form receives `{ path }`; the `{PATH}` token only works in string messages.
- `reviveDecimals` mutates the input object in place and also returns it—callers should be aware it is not a pure/immutable operation.
