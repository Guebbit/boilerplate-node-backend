---
source: tests/support/schema.ts
sha256: 8bbf9436854000ff73e9097412550b00800e4373b204f15b858dd5b987e85ceb
generated_at: 2026-09-23T20:13:56.053392+00:00
model: ollama:qwen3.8:27b
---

# tests/support/schema.ts

## Purpose

A suite of pure, database-free readers that inspect a Mongoose `Schema` object's declared contract—required paths, index names/directions/options, defaults, enums, nested schemas, and schema-level flags—so that unit tests can assert the schema _as declared_ rather than inferring it from saved documents. It exists because document-shape integration tests cannot detect mutations that leave valid documents unchanged (dropped `required`, lost `_id: false`, flipped index direction, removed `timestamps`).

## Key elements

- **`IntrospectableSchema`** (exported interface) — Structural, generic-free shape (`path()`, `indexes()`, `paths`, `options`) that any concretely-typed Mongoose `Schema` satisfies without triggering TypeScript's generic assignability failures.
- **`pathNames(schema)`** — All declared path names (including Mongoose-added `_id`, `__v`, timestamps), sorted.
- **`requiredPaths(schema)`** — Subset of paths with `isRequired === true`, sorted.
- **`indexSpecs(schema)`** — Each declared index rendered as `"name: field+1, field-1"`, sorted.
- **`indexBehaviour(schema)`** — Record mapping index name → behavioural options (uniqueness, sparseness, TTL), excluding the `name` key itself.
- **`indexOptionSpecs(schema)`** — Same as `indexBehaviour` but rendered as sorted `"name: key=value, …"` strings; uses `"(none)"` for option-less indexes.
- **`pathOptions(schema, path)`** — Raw `options` object for a single path (min/max, lowercase, trim, etc.).
- **`defaultOf(schema, path)`** — Declared `default` value; invokes the function if one was supplied.
- **`enumOf(schema, path)`** — `enumValues` array or `undefined`.
- **`subSchema(schema, path)`** — Nested `IntrospectableSchema` for an embedded array/subdocument path; throws with a listing of valid nested paths if the path has none.
- **`optionsOf(schema)`** — Schema-level options object (`timestamps`, `_id`, `collection`, …).
- **`refOf(schema, path)`** — Target model name of a `ref`, or `undefined`.
- **`typeOf(schema, path)`** — Mongoose `instance` string (`String`, `Number`, `ObjectId`, `Array`, `Embedded`, …).
- **`indexName`** (internal) — Derives the index name the way Mongoose does at build time: uses the explicit `name` option if present, otherwise joins `field_direction` segments with `_`.

## Relationships

Every `src/modules/*/tests/unit/schema-contract.test.ts` file (addresses, api-keys, audit-logs, cart, delivery, feedback, inventory, locales, orders, payments, products, users, webhooks, wishlist) imports the exported readers to assert its module's Mongoose schema contract in a pure unit test. No other files depend on this module.

## Notes

- **Structural typing is deliberate.** `IntrospectableSchema` avoids Mongoose's 11-parameter generic `Schema`, which is not mutually assignable across different type arguments (TS7056-class issue). Do not replace it with `Schema` or the assignability errors return.
- **`indexName` mirrors Mongoose's build-time derivation.** For a path-level `unique: true` (no explicit `name`), the name is `field_1` (or `field_-1`). Tests should assert the _derived_ name, not the absent one, because that is what `db:sync` and `dropIndex` use.
- **`defaultOf` calls functions.** If a schema declares `default: () => new Date()`, this helper invokes it. It is not a passive read.
- **`subSchema` throws on a non-nested path** and includes the list of paths that _do_ carry a nested schema, to make typos self-diagnosing.
- **All list-returning helpers use `.toSorted()`** (non-mutating). This is a project convention; do not "fix" to `.sort()`.
- **`indexOptionSpecs` renders `"(none)"`** rather than an empty string for indexes with no behavioural options, so a test asserting the literal string can distinguish "declared plain" from a rendering bug.
