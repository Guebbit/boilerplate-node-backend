---
source: tests/integration/persistence/money-field.test.ts
sha256: e403cf3b55fee20cf351f3f8d285b801347cecc8ecb157f0df67c112021f804e
generated_at: 2026-10-15T12:50:09.077817+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/persistence/money-field.test.ts

## Purpose

Integration test that exercises the `money-field` persistence plugin against a real (MongoDB) database. It verifies concerns a unit mock cannot cover: that values are physically stored as `Decimal128`, that all read paths (hydrated, lean, `findOneAndUpdate`, `toJSON`) return plain numbers, that `$sum` aggregation avoids float drift, that queries match regardless of stored scale, and that validation (`nonNegative`, finiteness) is enforced by the plugin.

## Key elements

- **`Probe` interface** — test-only shape with a top-level required money field, an optional defaulted one, and a subdocument array of money fields; exists solely to drive every read path.
- **`probeSchema` / `probeModel`** — a scratch Mongoose model (`MoneyProbe`) wired with `moneyPath` per-field and `moneyPlugin` on the schema, so the assertions target the plugin rather than any domain model.
- **`serialize`** — the result of `applySerialization(probeSchema)`, used to confirm the serialization layer also yields plain numbers.
- **`stored(id)`** — helper that reads directly from `probeModel.collection.findOne`, bypassing all Mongoose getters, to inspect the raw BSON type.
- **`describe('a money field')`** — five specs covering: Decimal128-at-rest + number-on-read; lean / update / `toJSON` / `serialize` consistency; exact `$sum` + `toMinorUnits`; query-by-value; and rejection of negative/non-finite amounts where configured.

## Relationships

- **`src/infrastructure/persistence/money-field.ts`** — the system under test; provides `moneyPath` (field factory) and `moneyPlugin` (schema-level plugin) that this file wires into the probe schema.
- **`src/infrastructure/persistence/serialize.ts`** — provides `applySerialization`, invoked once on the probe schema; one spec asserts its output matches plain-number expectations.
- **`src/shared-kernel/money.ts`** — provides `toMinorUnits`, used in the `$sum` spec to confirm the aggregated `Decimal128` converts to an integer minor-unit count without float intermediates.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb`, called at module load to start/connect the test database instance.

## Notes

- The model is intentionally a **scratch** model (`MoneyProbe`), not a real domain model. This keeps the test scoped to the plugin's contract and avoids coupling to any single entity's schema.
- `stored()` reads via the raw Mongoose **collection**, so it sees BSON `Decimal128` objects with a `_bsontype` property — no getters or transforms are applied.
- The nested `lines` subdocuments are declared with `_id: false`; the negative-price spec on `lines` **resolves** (is allowed) because that `moneyPath` call omits `nonNegative`, contrasting with the top-level field where it is set.
- `setupTestDb()` is called once at the top level (not per-test), relying on the test runner's lifecycle for teardown.
