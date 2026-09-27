---
source: tests/unit/infrastructure/persistence/create-repository.test.ts
sha256: 33005007186646b8d46c554a44966b98a28119d59585c649c0311a7253fe55cf
generated_at: 2026-09-27T16:09:24.240079+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/persistence/create-repository.test.ts

## Purpose

Unit tests for the `buildWhere` filter-bag-to-Mongo-query compiler and the `withScope` helper exported by `create-repository.ts`. The tests are pure and DB-free: they exercise only the specification-driven compilation rules (coercion, trimming, per-kind operators) without ever invoking a Mongoose model.

## Key elements

- **`buildWhereFor(searchable)`** – Test helper that calls `createRepository` with a stub model, an identity transform, and the given `SearchSpec`, returning the resulting `buildWhere` closure for assertion.
- **`stubModel`** – An empty cast to `Model<FixtureDocument>`; never called, exists only to satisfy the `createRepository` signature.
- **`describe('buildWhere — objectIds')`** – Verifies `Types.ObjectId` coercion, trimming, blank/absent omission, array → `$in`, per-element blank filtering, and that malformed IDs throw.
- **`describe('buildWhere — exact')`** – Verifies trimmed verbatim match and blank omission.
- **`describe('buildWhere — booleans')`** – Verifies literal `true`/`false` pass through; non-boolean values (e.g. string `'false'`) are omitted.
- **`describe('buildWhere — regex')`** – Verifies special-character escaping and `$options: 'i'`.
- **`describe('buildWhere — arrayRegex')`** – Verifies `$elemMatch` wrapping.
- **`describe('buildWhere — text')`** – Verifies `$or` across all declared fields; an empty `text` array produces no `$or`.
- **`describe('buildWhere — ranges')`** – Verifies `$gte`/`$lte` composition, one-sided bounds, and that non-numeric bounds are dropped (no `NaN` reaches Mongo).
- **`describe('buildWhere — composing multiple kinds')`** – Confirms independent paths don't clobber each other.
- **`describe('withScope')`** – Confirms `$and` merging when both filter and scope contain `$or`, and passthrough when one side is empty.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** (sibling in the dependency graph) — the sole system under test. This file imports `createRepository`, `withScope`, and the `SearchSpec`/`Wire` types from it. No other module is exercised.
- **`mongoose`** — imported only for `Types.ObjectId` (assertions) and the `Model`/`Document` types (stub typing). No Mongoose runtime behavior is tested here.

## Notes

- The test file deliberately avoids any database connection; if a test accidentally triggers a model method, it would fail on the empty stub rather than silently passing against a real collection.
- `objectIds` and `booleans` are the two kinds with *type-strict* contracts (throw on bad ObjectId, require literal boolean). The other kinds are *lenient* (omit on blank/invalid). This asymmetry is intentional and worth preserving when adding new kinds.
- `withScope` only produces `$and` when both arguments are non-empty; a single-side call is returned as-is, which matters for query-plan cardinality.
