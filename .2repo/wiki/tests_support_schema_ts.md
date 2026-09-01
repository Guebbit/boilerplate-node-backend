# tests/support/schema.ts

## Purpose

A set of read-only introspection helpers that extract a Mongoose schema's contract (required fields, indexes, defaults, enums, nested schemas, schema-level options) directly from the schema object at runtime. This lets unit tests assert the *declaration* of a schema — things that don't change the shape of a valid document but break quietly (a dropped `required`, a renamed index, a missing `_id: false`) — without spinning up a database or round-tripping a document.

## Key elements

- **`IntrospectableSchema`** – Structural interface (`path()`, `indexes()`, `paths`, `options`) that any concretely-typed Mongoose `Schema` is assignable to, avoiding Mongoose's eleven-generic assignability pitfalls.
- **`pathNames`** – Sorted list of all declared path names (including `_id`, `__v`, timestamps).
- **`requiredPaths`** – Sorted names of paths carrying `required: true`.
- **`indexSpecs`** – Sorted `name: field+1, field-1` strings for every declared index; the name is derived the same way Mongoose does (declared `name` or `field_direction` join) so it matches what a migration or `dropIndex` must say.
- **`indexBehaviour`** – Map of index name → behavioural options (uniqueness, sparseness, TTL), excluding the `name` key.
- **`indexOptionSpecs`** – Same data rendered as sorted `name: key=value, …` strings (uses `(none)` for empty option sets) so tests can assert the whole set as a string literal without naming-convention lint issues on index-name keys.
- **`pathOptions`** – Raw `options` object for a single path (min/max/lowercase/trim/etc.), avoiding per-test double-casts.
- **`defaultOf`** – The `default` for a path; invokes it if it is a function.
- **`enumOf`** – The `enumValues` array for a string path, or `undefined`.
- **`subSchema`** – The nested `IntrospectableSchema` hanging off an embedded path; throws with a helpful listing of which paths *do* carry a sub-schema if the name is wrong.
- **`optionsOf`** – The schema-level `options` object (`timestamps`, `_id`, `collection`, …).
- **`refOf`** – The `ref` model name on a path, or `undefined`.
- **`typeOf`** – The Mongoose `instance` type name (`String`, `ObjectId`, `Array`, …).

## Relationships

- **Consumed by** every `src/modules/*/tests/unit/schema-contract.test.ts` (account, audit-logs, cart, delivery, feedback, inventory, locales, orders, payments, products, users, wishlist) as the shared assertion vocabulary for schema-contract unit tests.
- **Index-name derivation** must stay in lockstep with the index declarations in `db/migrations/20240101000000-initial-indexes.js`, `db/migrations/20260808180000-prune-unused-indexes.js`, and `db/migrations/20260817140000-locale-collections.js`; if a migration renames or drops an index, the corresponding `indexSpecs`/`indexOptionSpecs` assertion will catch the drift.

## Notes

- The module deliberately reads only what is already on the schema object (`paths`, `indexes()`, `options`) so tests run in milliseconds with zero I/O — no connection, no model compile.
- `IntrospectableSchema` uses `unknown` returns and `object` members on purpose; the narrowing to `SchemaPath` / concrete option shapes happens inside each reader. Pinning Mongoose's generic types here would reintroduce the TS7056 assignability error.
- `indexName` is private (not exported); tests should go through `indexSpecs` or `indexBehaviour`, which already embed the name.
- `defaultOf` *invokes* function defaults. If a test calls it on a path whose default has side effects, those side effects execute.
- `subSchema` throws rather than returning `undefined` to surface a wrong path name early; the error message lists every path that *does* carry a nested schema.
