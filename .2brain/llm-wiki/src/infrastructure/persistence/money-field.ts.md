---
source: src/infrastructure/persistence/money-field.ts
sha256: 278b2aabcd9836b856aad736c98ade5413eef70ea6d397982d6c3892b4d10099
generated_at: 2026-11-08T03:43:29.721899+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/money-field.ts

## Purpose

Bridges the gap between MongoDB's `Decimal128` storage type and the decimal-text representation (`"19.90"`) that every layer above persistence expects. Provides the Mongoose schema path definition, a lean-query plugin, and a serialization-time padding helper so that money amounts are exact at rest, unambiguous in code, and correctly formatted on the wire.

## Key elements

- **`moneyPath(options?)`** — Returns a Mongoose schema-path definition typed as `Decimal128` with a getter that yields decimal text. Accepts `required`, `nonNegative`, and `default`. Tags the path with a custom `money: true` flag used later for discovery.
- **`moneyPlugin(schema)`** — Mongoose plugin that registers a `post('find'|'findOne'|…)` hook. When the query was run `.lean()`, it calls `stringifyDecimals` on the result so lean rows return text, not `Decimal128` objects.
- **`moneyPathsOf(schema, prefix?)`** — Walks a schema (including nested/embedded schemas) and returns the dotted path of every field marked with `money: true`.
- **`padMoneyPaths(serialized, paths, currency)`** — After serialization, pads each amount at the given paths to the currency's decimal places using `padDecimal` from the domain layer. Handles nested objects and arrays.
- **`stringifyDecimals(value)`** — Recursively replaces every `Decimal128` in a plain object/array with its `.toString()` text. Mutates in place.
- **`decimalToString(value)`** — Single-value converter: `Decimal128` → text, `string` → pass-through, `number` → `String(n)`, anything else → `undefined`.
- **`MoneyPathOptions`** — `{ required?, nonNegative?, default? }` shape accepted by `moneyPath`.
- **`MoneyWalkableSchema`** — Structural interface (`eachPath`) that `moneyPathsOf` needs; avoids importing Mongoose's `Schema` type.

## Relationships

- **`src/domain-primitives/money.ts`** — Imports `padDecimal`, the single source of truth for currency-aware decimal padding.
- **`src/infrastructure/persistence/serialize.ts`** — Consumes `moneyPathsOf` and `padMoneyPaths` to produce the final wire payload with correctly scaled amounts.
- **`src/modules/invoicing/model.ts`, `src/modules/orders/model.ts`, `src/modules/payments/model.ts`, `src/modules/products/model.ts`, `src/modules/returns/model.ts`** — Each declares one or more money fields via `moneyPath` in its Mongoose schema.
- **`src/modules/payments/repository.ts`** — Applies `moneyPlugin` to its model so `.lean()` reads return text.
- **`tests/unit/infrastructure/persistence/money-field.test.ts`** — Unit tests for `decimalToString`, `stringifyDecimals`, `moneyPath` validation, `moneyPathsOf`, and `padMoneyPaths`.
- **`tests/integration/persistence/money-field.test.ts`** — Integration tests exercising the full read/write cycle (hydrated, lean, `toJSON`) against a real Mongoose connection.

## Notes

- **No setter is defined.** Mongoose's built-in casting handles `number`/`string` → `Decimal128` on write; the only custom logic is the getter.
- **`isDecimal128` checks `_bsontype`**, not `instanceof`, to avoid breakage from duplicate BSON library copies in the dependency tree.
- **Padding happens exactly once**, in `padMoneyPaths` at serialization time. The getter (`decimalToString`) intentionally does *not* pad; it preserves whatever scale the DB holds. This matters because `$inc`/`$sum` can drop trailing zeros.
- **Aggregation results are not hooked** by `moneyPlugin`. A pipeline's `$sum` output is expected to be read as minor units by the caller, not through the text getter.
- **The `DECIMAL128_FOR_TEXT_FIELD` cast** exists because Mongoose's type system only accepts `String` for a field whose TS interface is `string`, even though the actual BSON type is `Decimal128`. The cast is localized here so the rest of the codebase stays clean.
- **`nonNegative` validation** converts the stored value back to a number via `Number(text)` for the check; this is safe because `Decimal128.toString()` always yields a finite decimal string for valid amounts.
