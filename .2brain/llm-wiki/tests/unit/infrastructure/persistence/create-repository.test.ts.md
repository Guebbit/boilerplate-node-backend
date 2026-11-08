---
source: tests/unit/infrastructure/persistence/create-repository.test.ts
sha256: a9b15784b6a897d58bfdae08170cc6f791b1c3043e783b9bfd97157236cfcb70
generated_at: 2026-11-08T10:21:49.469796+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/persistence/create-repository.test.ts

## Purpose

Unit tests for `buildWhere` (the filter-bag-to-Mongo-query compiler) and `withScope`, both exported from `create-repository.ts`. The tests are pure and DB-free: the Mongoose model is a stub that is never called, so the suite isolates the id-coercion, empty/blank handling, and per-kind compilation rules that every module's `search()` relies on.

## Key elements

- **`buildWhereFor(searchable)`** — helper that calls `createRepository` with a `stubModel`, an `identityTransform`, and the given `SearchSpec`, then returns the resulting `buildWhere` function for direct assertion.
- **`stubModel`** — `{} as Model<FixtureDocument>`; satisfies the type system without any real model or connection.
- **`identityTransform`** — pass-through transform so the test focuses solely on `buildWhere` output.
- **Test suites** (one per `SearchSpec` kind):
  - `objectIds` — coercion to `Types.ObjectId`, trimming, `$in` arrays, blank-element dropping, malformed-id rejection.
  - `exact` — trimmed verbatim match; omitted when absent/blank.
  - `booleans` — only literal `true`/`false` produce a filter; strings like `'false'` are dropped.
  - `regex` — case-insensitive, special-char-escaped `$regex`.
  - `arrayRegex` — same pattern wrapped in `$elemMatch`.
  - `text` — `$or` across all declared fields; empty `text` array means no `$or` even if the caller sends a value.
  - `ranges` — numeric min/max → `$gte`/`$lte`; non-numeric bounds dropped silently.
  - `dateRanges` — ISO strings → `Date` instants; unparseable bounds dropped.
  - *Composing multiple kinds* — verifies independence (no clobbering) when several kinds are active simultaneously.
  - **`withScope`** — confirms `$and` wrapping when both filter and scope carry `$or`, and pass-through when one side is empty.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** (only dependency) — the test imports `createRepository` (to obtain `buildWhere`), the `SearchSpec` and `Wire` types (to type the fixtures), and `withScope` (tested directly). No other production module is imported.
- **`mongoose`** — used only for `Types.ObjectId` (assertions) and the `Model`/`Document` types (stub typing). No Mongoose runtime features are exercised.

## Notes

- The boolean kind is deliberately stricter than an `isPresent` check: a raw query-string `'false'` must **not** become a filter. Only `typeof === 'boolean'` values pass through.
- `text: []` (empty array in the spec) is a distinct case from `text: ['field']` — with no declared fields, even a non-blank caller value yields no `$or`.
- `withScope` does not merge `$or` arrays; it wraps them in `$and` to preserve both halves.
- All "omission" assertions check that the key is entirely absent from the resulting object (not present with `undefined` or `null`), because downstream Mongo queries treat a missing key as "no filter" while a present key with `undefined` can cause unexpected behaviour.
