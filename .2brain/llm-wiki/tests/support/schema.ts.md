---
source: tests/support/schema.ts
sha256: a61d0192512910fa95864448745f16994f771ba8e97e76f932d5fed87ed4a71a
generated_at: 2026-10-15T13:01:18.015012+00:00
model: ollama:qwen3.8:27b
---

# tests/support/schema.ts

## Purpose

Introspection helpers that read Mongoose schema declarations—required flags, index names/directions, path types, defaults, enums, sub-schemas, timestamps, `_id`, and validator behaviour—directly off the schema object, with no database or document round-trip. It exists so module-level unit tests can pin the *declaration* of a schema (the things that fail silently as collection scans, missing timestamps, or extra ObjectIds) rather than only the *shape* of a saved document, which integration tests already cover.

## Key elements

- **`IntrospectableSchema`** (exported interface) — structural, non-generic type (`path()`, `indexes()`, `paths`, `options`) that any Mongoose `Schema` satisfies regardless of its type parameters. Avoids the 11-generic assignability trap of importing `Schema` directly.
- **`SchemaPath`** (internal interface) — minimal view of what `schema.path()` returns: `instance`, `isRequired`, `options`, `enumValues`, `schema`, `defaultValue`.
- **`indexName`** (internal) — resolves the Mongo index name: uses the declared `name` option if present, otherwise derives `field_direction` joined by `_` (mirroring Mongoose's build-time naming for unnamed `unique` indexes).
- **`pathNames`** — sorted list of all declared path names (including Mongoose-added `_id`, `__v`, timestamps).
- **`requiredPaths`** — sorted names of paths carrying `required: true`.
- **`indexSpecs`** — sorted `name: field+1, field-1` strings for every declared index (direction kept because it is load-bearing on compound indexes).
- **`indexBehaviour`** — map of index name → behavioural options (uniqueness, sparseness, TTL, etc.), excluding the `name` key.
- **`indexOptionSpecs`** — same data rendered as sorted `name: key=value, …` strings; uses `(none)` sentinel for option-less indexes.
- **`pathOptions`** — raw `options` object for a given path (min, max, lowercase, trim, etc.).
- **`defaultOf`** — declared default for a path; calls function defaults.
- **`enumOf`** — `string[]` enum values for a path, or `undefined`.
- **`subSchema`** — the nested `IntrospectableSchema` on an embedded/subdocument path; throws with a list of paths that *do* carry a nested schema if the requested path has none.
- **`optionsOf`** — schema-level options (`timestamps`, `_id`, `collection`, …) as a record.
- **`refOf`** — referenced model name for a path, or `undefined`.
- **`typeOf`** — Mongoose type string (`String`, `Number`, `ObjectId`, `Array`, `Embedded`, …) for a path.
- **`refuses`** — runs `cast` then `doValidateSync` on a candidate value to report whether the path's own validators reject it (mirrors the write path).

## Relationships

- Consumed by every `src/modules/*/tests/unit/schema-contract.test.ts` (account, addresses, api-keys, audit-logs, cart, delivery, feedback, inventory, invoicing, locales, orders, payments, products, returns, users) and `src/modules/account/tests/unit/auth-schemas.test.ts`. Those suites call the exported readers to assert the schema contract of their respective `model.ts` files in milliseconds, without a connection.
- No runtime dependency on application source; it only needs the Mongoose `Schema` instance the test file constructs.

## Notes

- `IntrospectableSchema` is intentionally structural and generic-free. Importing and typing against Mongoose's `Schema` (11 type parameters) causes TS assignability failures; this is the same reason `Repository` is a hand-written type in the project.
- `indexName` must stay in sync with Mongoose's build-time naming for unnamed indexes; a test asserting a derived name is asserting what `db:sync` and `dropIndex` will actually use.
- `refuses` calls `cast` before `doValidateSync` to replicate how Mongoose resolves the stored type before validating—order matters for type-coercion edge cases.
- All list-returning readers use `.toSorted()` (non-mutating) so callers can reuse the source array.
- The `(none)` sentinel in `indexOptionSpecs` distinguishes a genuinely option-less index from a rendering bug; do not replace with an empty string.
