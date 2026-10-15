---
source: tests/unit/infrastructure/persistence/create-repository.test.ts
sha256: a9b15784b6a897d58bfdae08170cc6f791b1c3043e783b9bfd97157236cfcb70
generated_at: 2026-10-15T13:18:05.169632+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/persistence/create-repository.test.ts

## Purpose

Unit tests for the `buildWhere` filter-to-Mongo-query compiler and the `withScope` helper exported by `create-repository.ts`. Validates the per-kind compilation rules (id coercion, blank handling, regex escaping, range/date parsing, `$or` composition) without any database connection, using a stub Mongoose model that is never invoked.

## Key elements

- **`buildWhereFor(searchable: SearchSpec)`** – Local helper that calls `createRepository` with a stub model, an identity `transform`, and the given `SearchSpec`, then returns the resulting `buildWhere` function. Every `describe` block derives its SUT from this helper.
- **`stubModel`** – A cast empty object (`{} as Model<FixtureDocument>`) that satisfies the type signature of `createRepository` without any Mongoose model behavior.
- **`describe('buildWhere — objectIds')`** – Coercion to `Types.ObjectId`, trimming, omission of absent/empty/blank values, `$in` arrays, blank-element filtering, and throw-on-malformed-id behavior.
- **`describe('buildWhere — exact')`** – Trimmed verbatim string match; blank/absent omission.
- **`describe('buildWhere — booleans')`** – Both `true` and `false` are emitted; non-boolean values (e.g. the string `'false'`) are omitted.
- **`describe('buildWhere — regex')`** – Escapes special regex characters and sets `$options: 'i'`.
- **`describe('buildWhere — arrayRegex')`** – Wraps the pattern in `$elemMatch`.
- **`describe('buildWhere — text')`** – Builds an `$or` across all declared fields; empty field list emits nothing.
- **`describe('buildWhere — ranges')`** – `$gte`/`$lte` numeric bounds; non-numeric values are dropped.
- **`describe('buildWhere — dateRanges')`** – ISO strings become `Date` instances; unparseable values are dropped.
- **`describe('buildWhere — composing multiple kinds at once')`** – Confirms independent paths don't clobber each other.
- **`describe('withScope')`** – Verifies that two `$or`-bearing clauses are merged via `$and` rather than one overwriting the other; passthrough when either side is empty.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** – The sole production dependency. This test imports `createRepository`, `SearchSpec`, `Wire`, and `withScope` from that module and exercises their pure (DB-free) logic.

## Notes

- The `booleans` kind deliberately requires a strict `=== true / === false` check; the string `'false'` (a raw query-string value) must **not** produce a filter. This is stricter than a generic truthy check and is called out in an inline comment.
- `text` with an empty declared-field array (`{ text: [] }`) is a valid spec that matches nothing—this is tested explicitly to guard against a fallback that searches all fields.
- All tests are synchronous; there are no `async`/`await` calls, reflecting the pure-function contract of `buildWhere` and `withScope`.
