# tests/support/schema.ts

## Purpose

A pure, database-free set of introspection readers for Mongoose schema objects. It lets unit tests assert the *contract* a schema declares—required paths, index names and directions, defaults, enums, sub-schemas, schema-level options—by reading the schema object directly, catching silent regressions (dropped `required`, lost `_id: false`, renamed indexes, removed `timestamps`) that document-shape integration tests cannot see.

## Key elements

- **`IntrospectableSchema`** (exported interface) — Structural type with `path`, `indexes`, `paths`, `options`. Deliberately avoids Mongoose's 11-generic `Schema` to sidestep assignability failures (TS7056).
- **`pathNames(schema)`** — Sorted list of every declared path, including Mongoose-implicit ones (`_id`, `__v`, timestamps).
- **`requiredPaths(schema)`** — Subset of paths carrying `required: true`.
- **`indexSpecs(schema)`** — Sorted `"name: field+1, field-1"` strings for every declared index, preserving direction (load-bearing for compound indexes) and the Mongo-stored name.
- **`indexBehaviour(schema)`** — Map of index name → behavioural options (uniqueness, sparse, TTL), excluding the `name` key.
- **`indexOptionSpecs(schema)`** — Same as above rendered as sorted `"name: key=value, …"` strings; uses `"(none)"` for empty options to distinguish "no options" from a rendering bug.
- **`pathOptions(schema, path)`** — The raw options object a path was declared with (`min`, `max`, `trim`, etc.), avoiding per-assertion double casts.
- **`defaultOf(schema, path)`** — Declared default; invokes function-valued defaults the way Mongoose does.
- **`enumOf(schema, path)`** — `enumValues` array or `undefined`.
- **`subSchema(schema, path)`** — The nested schema hanging off an embedded-array / subdocument path; throws with a list of valid sub-schema paths if none found.
- **`optionsOf(schema)`** — Schema-level options (`timestamps`, `_id`, `collection`, …).
- **`refOf(schema, path)`** — Referenced model name, or `undefined`.
- **`typeOf(schema, path)`** — Mongoose type name (`String`, `ObjectId`, `Embedded`, …).

## Relationships

- **Consumed by** every module's `schema-contract.test.ts` (account, audit-logs, cart, delivery, feedback, inventory, locales, orders, payments, products, users, wishlist). Each test file imports these readers to pin the schema contract for its module without spinning up a DB.
- **Validates against** the index names and options established by the migration files (`initial-indexes`, `prune-unused-indexes`, `locale-collections`). The `indexName` derivation here must stay consistent with what those migrations create or drop, since a rename in one place silently orphans the other.

## Notes

- **Structural typing, not nominal.** `IntrospectableSchema` is intentionally minimal. Do not widen it to Mongoose's `Schema` type—the 11 generics make a concretely-parameterised schema unassignable and break every module test.
- **No DB, no async.** Every reader is synchronous and pure; tests run in milliseconds and belong at the unit tier.
- **Index name derivation.** `indexName` reproduces Mongoose's build-time naming (`field_1`, `field_-1` joined by `_`) for indexes declared via `unique: true` on a path. If Mongoose changes its naming rule, this helper must follow.
- **`indexOptionSpecs` string form is intentional.** Index names are neither camelCase nor snake_case, so using them as object keys in test assertions trips the project's naming-convention lint rule. Rendering them as strings once here avoids per-line disables in a dozen suites.
- **`defaultOf` executes functions.** A `default: () => new Date()` will be called during the assertion. Keep defaults pure or be aware of side effects in tests.
- **All sorted outputs use `.toSorted()`** (non-mutating, ES2023). The original arrays from Mongoose are never modified.
