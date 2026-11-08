---
source: tests/support/schema.ts
sha256: a61d0192512910fa95864448745f16994f771ba8e97e76f932d5fed87ed4a71a
generated_at: 2026-11-08T09:59:21.796293+00:00
model: ollama:qwen3.8:27b
---

# tests/support/schema.ts

## Purpose

Test-support module that reads a Mongoose schema's declarative contract (required fields, indexes, defaults, enums, nested schemas, schema-level options) directly off the schema object—no database needed. It exists so unit tests can assert *what the schema declares* rather than only what a persisted document looks like, catching silent regressions (dropped `required`, lost `_id: false`, renamed indexes, removed `timestamps`) that integration tests through documents would miss.

## Key elements

- **`IntrospectableSchema`** — Structural interface (no generics) that any `new Schema<…>` satisfies. Deliberately avoids Mongoose's eleven generic parameters to sidestep assignability breakage (TS7056-class issues).
- **`pathNames`** — All declared path names (including Mongoose-added `_id`, `__v`, timestamps), sorted.
- **`requiredPaths`** — Subset of path names where `isRequired` is true; tests assert the full set.
- **`indexSpecs`** — Every declared index rendered as `"name: field+1, field-1"`, sorted. Keeps direction (load-bearing on compound indexes) and the Mongo index name (what `db:sync` / `dropIndex` reference).
- **`indexBehaviour`** — Index options (unique, sparse, TTL, …) keyed by index name, excluding the `name` key itself.
- **`indexOptionSpecs`** — Same data as `indexBehaviour` but rendered as sorted `"name: key=value, …"` strings; `(none)` when an index has no options. Exists so tests can assert the full set without object keys that violate naming-convention lint.
- **`pathOptions`** — Raw `options` object for a single path (min, max, lowercase, trim, etc.). Centralises the cast so tests don't repeat double-casts.
- **`defaultOf`** — Declared default for a path; calls the value if it is a function (mirrors Mongoose).
- **`enumOf`** — `enumValues` array for a string path, or `undefined`.
- **`subSchema`** — Returns the nested `IntrospectableSchema` on an embedded-array or subdocument path. Throws with a helpful message (listing valid paths) if the path has none.
- **`optionsOf`** — Schema-level options object (`timestamps`, `_id`, `collection`, …).
- **`refOf`** — Target model name from `ref`, or `undefined`.
- **`typeOf`** — Mongoose type name (`String`, `Number`, `ObjectId`, `Array`, `Embedded`, …).
- **`refuses`** — Casts a candidate value the same way a write would, then runs `doValidateSync`; returns `true` if the path's own validators reject it (covers `min`-as-validator on non-numeric types).
- **`indexName`** (internal) — Resolves the Mongo index name: uses the declared `name` option if present, otherwise derives `field_direction` joined by `_` (matching Mongoose's build-time derivation for path-level `unique`).

## Relationships

- **Consumed by** `schema-contract.test.ts` in every feature module (account, addresses, api-keys, audit-logs, cart, delivery, example, inventory, invoicing, locales, notifications, orders, payments, products). Each test imports the reader functions and asserts its module's schema contract in isolation.
- **Consumed by** `src/modules/account/tests/unit/auth-schemas.test.ts`, which uses the same introspection helpers for auth-specific schema assertions.
- **Depends on** Mongoose's `Schema` instance API (`path()`, `indexes()`, `paths`, `options`) at runtime; no database connection or model compilation required.

## Notes

- All readers return **sorted** arrays (`.toSorted()`) so test assertions are order-independent and diff-friendly.
- `IntrospectableSchema` is intentionally loose (`unknown`, `object`); the narrowing cast happens once inside each reader, not at the call site. Passing a concretely-typed `Schema<F, M, …>` is safe regardless of generic arguments.
- `indexName` replicates Mongoose's naming rule for path-level `unique: true` indexes (`field_1`). If you rename a declared index, `db:sync` must drop the old name before the new one is created—asserting the name here is what catches that drift.
- `refuses` calls `cast()` before `doValidateSync()`, matching how Mongoose processes a write; skipping the cast would validate against the raw JS type rather than the stored type.
- `subSchema` throws (rather than returning `undefined`) when the path is not an embedded path, and the error message lists every path that *does* carry a nested schema—reduces copy-paste typos in test fixtures.
