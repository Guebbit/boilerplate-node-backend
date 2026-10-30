---
source: tests/integration/persistence/money-field.test.ts
sha256: edc89a8e40cf6a5e773fb864070365cca98f3d18c17a6501e9cbb6f7a8b5f626
generated_at: 2026-10-29T07:00:25.616252+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/persistence/money-field.test.ts

## Purpose

Integration tests that verify the `money-field` persistence plugin against a real MongoDB instance. They confirm what unit-level mocks cannot: the on-disk type is `Decimal128`, every read path (hydrated, lean, `toJSON`, `findOneAndUpdate`) returns plain numbers, a database `$sum` produces exact cent arithmetic, and validation (non-negative, non-finite) rejects bad writes while permitting legitimate negatives in nested discount lines.

## Key elements

- **`Probe` interface** — test document shape with a top-level `amount`, an optional `refunded`, and a nested `lines[].price`, each declared via `moneyPath`.
- **`probeSchema` / `probeModel`** — a scratch Mongoose schema and model (`MoneyProbe`) that carries `moneyPlugin` and `applySerialization`, isolating the plugin's contract from any domain model.
- **`stored(id)`** — raw `collection.findOne` helper that bypasses Mongoose to inspect the actual BSON type (`_bsontype === 'Decimal128'`).
- **`serialize`** — the output of `applySerialization(probeSchema)`, used to assert that the serialization layer also yields numbers.
- **Four `it` blocks** — storage type + hydrated read; lean / `findOneAndUpdate` / `toJSON` reads; `$sum` precision via `toMinorUnits`; validation rejection of negative and non-finite values.

## Relationships

- **`src/infrastructure/persistence/money-field.ts`** — the system under test; the test imports `moneyPath` (schema path helper) and `moneyPlugin` (validator/serializer plugin).
- **`src/domain-primitives/money.ts`** — imports `toMinorUnits` to assert that a DB-returned `Decimal128` converts to exact integer cents without float drift.
- **`src/infrastructure/persistence/serialize.ts`** — imports `applySerialization` to verify the generic serialization wrapper works on top of the money plugin.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()` which connects to (and cleans) a real MongoDB before the suite runs.

## Notes

- Tests require a reachable MongoDB; they are **not** runnable in a pure-CI unit step without a database container.
- The nested `lines[].price` field intentionally omits `nonNegative`, so negative discounts are valid there while top-level `amount` rejects them. The validation test asserts this asymmetry explicitly.
- The `stored()` helper exists solely to assert the raw BSON type; all other assertions go through Mongoose read paths.
- The scratch model name `MoneyProbe` is registered globally via `model()`; if other test files in the same process use the same name, Mongoose will reuse the existing model rather than creating a new one.
