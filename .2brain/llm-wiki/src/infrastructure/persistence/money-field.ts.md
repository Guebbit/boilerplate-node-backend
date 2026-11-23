---
source: src/infrastructure/persistence/money-field.ts
source_sha256: ad1883159c110879c04af4de42b1842522b0488671ea4e0fd5218c7b8f9733b0
context_sha256: 5953fe209f939bf2efc86aefe9dc42e6330f2279c1cd023cd3a7e04cfc0e1a15
generated_at: 2026-11-22T03:03:08.575013+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/persistence/money-field.ts

## Purpose
Defines how money is stored and read in Mongoose models. Amounts are persisted as BSON `Decimal128` (exact, usable with a database `$sum`), while everything above the persistence layer sees them as decimal text such as `"19.9"`, never a float. The file supplies the schema definition, read-side conversions for hydrated, lean and JSON output, and the helpers that pad amounts to the currency's places for the wire.

## Key elements
- `moneyPath(options?)`: schema definition for one money field. It uses `Decimal128` as the type, sets a custom `money: true` option, and adds the `decimalToString` getter and a validator. The validator requires a finite amount, and non-negative when `nonNegative` is set. It also accepts `required` and a text `default`.
- `MoneyPathOptions`: the options interface (`required`, `nonNegative`, `default`).
- `moneyPlugin(schema)`: Mongoose plugin with a post hook on `find`, `findOne`, `findOneAndUpdate`, `findOneAndDelete` and `findOneAndReplace`. When the query is `.lean()`, it converts the returned rows' `Decimal128` values to text. Aggregations are deliberately not hooked.
- `decimalToString(value)`: converts a `Decimal128` to its text. A string or number becomes plain text, and anything else (an absent field) becomes `undefined`. It keeps the stored scale and does not pad.
- `stringifyDecimals(value)`: recursively replaces every `Decimal128` in a document with its text, in place. It walks plain objects and arrays only.
- `moneyPathsOf(schema, prefix?)`: returns the dotted paths of all `moneyPath` fields, including those in embedded schemas (e.g. `refunds.amount`), outermost first. It finds them through the `money` option.
- `MoneyWalkableSchema`: structural type exposing only `eachPath`.
- `padMoneyPaths(serialized, paths, currency)`: pads every amount at the given paths to the currency's places, in place, walking through objects and arrays. Values past the currency's places are rounded.

## Relationships
- `@domain-primitives/money` (`src/domain-primitives/money.ts`): supplies `padDecimal`, used for the padding. Arithmetic stays in integer minor units there.
- `src/infrastructure/persistence/serialize.ts`: the module header names the serializer's transform as the `toJSON` path (`stringifyDecimals`). It is also where wire padding takes place, using `moneyPathsOf` and `padMoneyPaths`.
- Model files under `src/modules/` (invoicing, orders, payments, products, returns): the related models that declare their amount fields with `moneyPath` and apply `moneyPlugin`.
- `src/modules/payments/repository.ts`: a graph neighbor and consumer of these money models.
- `tests/unit/...` and `tests/integration/persistence/money-field.test.ts`: cover this file.

## Notes
- `isDecimal128` checks the `_bsontype` tag rather than `instanceof`, so it works with any copy of the BSON library.
- `DECIMAL128_FOR_TEXT_FIELD` is a single cast that lets Mongoose accept `Decimal128` for fields typed `string` in the document interfaces.
- No setter is needed because Mongoose casts text and numbers to `Decimal128` on write.
- Stored values lose trailing zeros (`$inc` and `$sum` also lose scale), so only the serialization step pads. The readers never do.
- Mongoose passes a function-form validator message `{ path }`, since the `{PATH}` token only works in a string message.
