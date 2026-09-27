---
source: tests/support/schema.ts
sha256: 5ad2653f85a8ad45f024d3c390904e3f44626a9d8c4b5c029834312af96d8902
generated_at: 2026-09-27T16:01:06.760016+00:00
model: ollama:qwen3.8:27b
---

# tests/support/schema.ts

## Purpose

Test-utility module that reads a Mongoose `Schema` object's declared contract (required flags, indexes, types, defaults, nested schemas, etc.) and exposes it through small, typed reader functions. This lets each module's `schema-contract.test.ts` assert on *what the schema declares* in milliseconds, without spinning up a database — catching silent regressions (dropped `required`, lost `_id: false`, renamed indexes) that integration tests through saved documents cannot see.

## Key elements

- **`IntrospectableSchema`** (exported interface) — Minimal structural type requiring only `path()`, `indexes()`, `paths`, and `options`. Avoids Mongoose's eleven generic parameters so any concretely-typed `Schema<…>` is assignable.
- **`pathNames`** — Sorted list of every declared path name (including Mongoose-added `_id`, `__v`, timestamps).
- **`requiredPaths`** — Sorted list of path names whose `isRequired` flag is set.
- **`indexSpecs`** — Sorted array of `"name: field+1, field-1"` strings capturing index name, fields, and direction.
- **`indexBehaviour`** — Map from index name to its behavioural options (uniqueness, sparseness, TTL), excluding the `name` key.
- **`indexOptionSpecs`** — Sorted array of `"name: key=value, …"` strings; renders `(none)` for option-less indexes.
- **`pathOptions`** — Raw `options` object for a given path (min, max, lowercase, trim, etc.).
- **`defaultOf`** — The `default` value for a path; calls the function if one was declared.
- **`enumOf`** — The `enumValues` array for a string path, or `undefined`.
- **`subSchema`** — The nested `IntrospectableSchema` on an embedded/array path; throws with a helpful listing of paths that do carry one.
- **`optionsOf`** — The schema-level `options` object (timestamps, `_id`, collection, …).
- **`refOf`** — The model name a path references, or `undefined`.
- **`typeOf`** — The Mongoose `instance` type name (`String`, `Number`, `ObjectId`, `Array`, `Embedded`, …).
- **`indexName`** (private) — Returns the declared index name or derives `field_direction` joined by `_`, matching Mongoose's build-time naming.

## Relationships

- **Consumed by** every `src/modules/*/tests/unit/schema-contract.test.ts` (addresses, api-keys, audit-logs, cart, delivery, feedback, inventory, locales, orders, payments, products, users, webhooks, wishlist). Each test imports the reader functions and asserts the module's `model.ts` schema contract.
- **No runtime dependency** on Mongoose itself — it only reads from the schema object passed in, so the test file that calls it must already have constructed the `Schema`.

## Notes

- The `IntrospectableSchema` interface deliberately types `indexes()` as `unknown[][]` and `options` as bare `object`. This is the workaround for a TypeScript structural-assignability failure: Mongoose's generic `Schema` (11 type params) is not assignable to itself with different arguments because TS walks into `ObjectId`'s members. Pinning concrete return types here would reintroduce the same error. Narrowing is done once inside each reader.
- `defaultOf` **invokes** function defaults to match Mongoose's own behaviour — a test asserting a default sees the resolved value, not a function reference.
- `indexName` derives the name from key directions when no explicit `name` option is given, so tests can pin the exact string that `db:sync` and `dropIndex` must use.
- All list outputs are `.toSorted()` so assertions are stable regardless of insertion order in the schema.
- `(none)` is rendered for indexes with zero behavioural options to visually distinguish "declared plain" from a rendering bug.
