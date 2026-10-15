---
source: src/modules/orders/tests/unit/schema-contract.test.ts
sha256: e13f5bd4886ff59be546d69995bfb738a3a51ffd6f8aeb52bd4f86648b3ddc83
generated_at: 2026-10-15T11:20:53.934576+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/schema-contract.test.ts

## Purpose

Unit test that asserts the **declarations** of the Mongoose `orderSchema` object directly—required paths, field types, defaults, enum values, sub-schema options, index specs, and schema-level options. It exists because integration tests that drive real saves/reads cannot detect declaration-level defects (a dropped `required`, a flipped `_id: false`, a reversed index direction) since none of those change what a *valid* document looks like. No database is needed; the helpers in `tests/support/schema.ts` inspect the schema object in memory.

## Key elements

- **`orderSchema`** (from `@modules/orders/model`) — the system under test; every assertion in the file targets this object or a sub-schema extracted from it.
- **`OrderStatus`** (from `@types`) — enum whose values the test compares against the schema's `enum` and `default` for the `status` path.
- **Assertion helpers** (from `@tests/schema`):
  - `requiredPaths(schema)` — returns the array of paths marked `required`.
  - `typeOf(schema, path)` — returns the Mongoose type constructor name (e.g. `'ObjectId'`, `'String'`).
  - `defaultOf(schema, path)` — returns the schema-level default for a path.
  - `enumOf(schema, path)` — returns the allowed enum values.
  - `refuses(schema, path, value)` — validates a value against the path's constraints and reports whether it is rejected.
  - `optionsOf(schemaOrPath)` — returns schema/path options (e.g. `_id`, `timestamps`).
  - `subSchema(schema, path)` — extracts a nested schema object.
  - `pathOptions(schema, path)` — returns per-path options such as `min`/`max`.
  - `indexSpecs(schema)` — returns an array of `"name: field+dir, …"` strings.
  - `indexOptionSpecs(schema)` — returns `"name: key=value, …"` strings for index options (sparse, unique, etc.).
- **Describe blocks** (top-level):
  - *what an order must carry* — required/optional paths, `userId` type, `transferReference` optionality.
  - *status* — enum matches `OrderStatus` values; default is `OrderStatus.pending`.
  - *money* — `shippingCost` has no default; negative values are refused.
  - *the embedded snapshots* — `items` sub-schema (no `_id`, `quantity` required, `product.taxRate` in [0,1], no inherited catalogue indexes), `shippingAddress`/`billingAddress` (no `_id`, required fields, `phone` optional).
  - *indexes* — exact set of ten named indexes with correct directions; sparse/unique flags.
  - *options* — `timestamps` is `true`.

## Relationships

- **`src/modules/orders/model.ts`** — exports `orderSchema`, the sole object under test.
- **`src/types/index.ts`** — exports the `OrderStatus` enum used to verify the `status` path's enum and default.
- **`tests/support/schema.ts`** — provides all ten assertion helper functions; this file is its only consumer in the unit-test layer.

## Notes

- `userId` is **deliberately not** in the required set—account-erasure flows unset it, so the schema cannot claim it is always present.
- Required-path assertions use `toEqual` (exact set) rather than `toContain`, so both a *removed* and an *added* `required` flag fail the test.
- Index names are asserted explicitly (not auto-derived by Mongoose) because MongoDB identifies indexes by name; a rename would orphan the production index.
- The `items.product` sub-schema uses a distinct `orderLineProductSchema` (not the catalogue's `productSchema`) specifically so no catalogue indexes leak onto the order collection.
- `shippingCost` absence (no default) is intentional and paired with `shippingMethod` absence; the OpenAPI contract and `orderTotal`'s `asMoney` helper both treat absent as zero.
