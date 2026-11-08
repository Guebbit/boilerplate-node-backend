---
source: tests/integration/persistence/money-field.test.ts
sha256: 60dde0022ba9d6bff739e996cb0dc3815f432ca1491e170d1a5e711bdcc8ac77
generated_at: 2026-11-08T09:44:52.279701+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/persistence/money-field.test.ts

## Purpose

Integration test that verifies the money-field persistence plugin against a real MongoDB instance. It confirms that amounts are stored as `Decimal128`, read back as decimal text on every read path (hydrated, lean, `toJSON`, `applySerialization`), padded to the row's currency scale, summed exactly in the database, and validated for negativity and finiteness. A scratch `MoneyProbe` model carries the plugin so the assertions target the plugin's contract, not any single production module.

## Key elements

- **`Probe` interface** — test document shape: a top-level `amount` (required, non-negative), a `refunded` (non-negative, default `'0'`), and a nested `lines[].price` (required, may be negative). Exercises both top-level and subdocument paths.
- **`probeSchema` / `probeModel`** — a throwaway Mongoose model with `moneyPath` on every amount field and `moneyPlugin` applied once. Isolated from production models.
- **`stored(id)`** — bypasses Mongoose entirely (`probeModel.collection.findOne`) to assert the raw BSON value is a `Decimal128` instance.
- **`describe('a money field')`** — four tests: raw BSON type + hydrated read; lean / `findOneAndUpdate` / `toJSON` / `applySerialization` all return strings; `$sum` aggregates to exact cents and `toMinorUnits` yields an integer; rejection of negative (when `nonNegative: true`) and non-finite values, with nested `price` allowed to be negative.
- **`describe('the canonical wire spelling')`** — parameterised over EUR (2 dp), JPY (0 dp), KWD (3 dp). Verifies that after an `$inc` (which drops trailing zeros from the stored `Decimal128`), both `toJSON` and `applySerialization` re-pad to the currency's scale. Also confirms a `$sum` result is padded identically.

## Relationships

- **`src/domain-primitives/money.ts`** — imports `toMinorUnits` to assert that a database-`$sum` Decimal128 (`0.30`) converts to the integer minor-unit value (30) without floating-point drift.
- **`src/infrastructure/persistence/money-field.ts`** — the system under test. `moneyPath` builds the schema definition (type, validators); `moneyPlugin` attaches the `toJSON` serialisation that pads to currency scale.
- **`src/infrastructure/persistence/serialize.ts`** — `applySerialization` is the lean-read serialisation path exercised alongside `toJSON`; the tests assert both produce the same padded decimal string.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` connects a real MongoDB instance (typically in-memory or a local container) so the tests run against genuine BSON storage rather than mocks.

## Notes

- The model is intentionally a scratch object (`MoneyProbe`), not a production model. If the plugin contract changes, only this file and the production models' schemas need updating; no other test couples to this name.
- `stored()` exists specifically to assert `_bsontype === 'Decimal128'`. Every other read path goes through Mongoose and would mask a regression to `Double` storage.
- The negative-amount test checks the *expanded* path name (`amount must be…`) in the error message, not the raw `{PATH}` placeholder, because Mongoose substitutes the path string before throwing.
- Nested `lines[].price` is declared without `nonNegative`, reflecting a real use-case (discount lines). Only the finite check (`NaN` / `Infinity`) rejects it.
- The `$inc` write in the wire-spelling test uses a plain `Number`, simulating the "caller forgets the scale" scenario; the plugin is expected to re-pad on read, not on write.
