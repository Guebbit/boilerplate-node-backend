---
source: tests/unit/infrastructure/persistence/create-repository.test.ts
sha256: 88a1414c3aa0da892cf22d37acd71f422ec887a3e16553d5fd97843ee068da8c
generated_at: 2026-09-23T20:25:26.288462+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/persistence/create-repository.test.ts

## Purpose

Unit tests for `buildWhere`, the pure filter-bag-to-Mongo-query compiler that every module's `search()` method relies on. The tests verify id-coercion, blank/empty handling, and per-kind compilation rules without touching a real database or Mongoose model.

## Key elements

- **`buildWhereFor(searchable)`** — helper that wires a stub model and `identityTransform` into `createRepository` and returns the `buildWhere` function under test.
- **`stubModel`** — a cast-empty `Model<FixtureDocument>`; never called, exists only to satisfy the `createRepository` signature.
- **`buildWhere — objectIds`** — verifies `Types.ObjectId` coercion, trimming, blank omission, malformed-id rejection, independent per-key handling, `$in` array expansion, blank-element filtering, and empty-array-as-no-filter semantics.
- **`buildWhere — exact`** — confirms trimmed verbatim string matching and omission of absent/blank values.
- **`buildWhere — booleans`** — asserts that only literal `true`/`false` pass through; the string `"false"` is intentionally rejected.
- **`buildWhere — regex`** — checks case-insensitive `$regex` with special characters escaped and `$options: 'i'`.
- **`buildWhere — arrayRegex`** — confirms the pattern is wrapped in `$elemMatch`.
- **`buildWhere — text`** — validates `$or` expansion across all declared fields; an empty field list produces no filter even when text is supplied.
- **`buildWhere — ranges`** — tests `$gte`/`$lte` composition, one-sided bounds, and dropping of non-numeric (NaN) bounds.
- **`buildWhere — composing multiple kinds at once`** — ensures independently declared kinds set their paths without clobbering each other.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — the module under test. The test imports `createRepository`, `SearchSpec`, and `Wire` from it and exercises the `buildWhere` method on the returned repository instance. No other production module is touched.

## Notes

- The model passed to `createRepository` is a stub (`{} as Model<FixtureDocument>`); `buildWhere` is documented as never invoking the model, so the stub is safe.
- The `Wire<T>` type parameter is supplied but the test only cares about `buildWhere`; the `transform` is set to identity to avoid interference.
- Boolean filtering is deliberately stricter than the generic "is present" check: the value must be a JavaScript boolean, not a decoded string like `"false"`.
- Malformed ObjectId strings (both scalar and array elements) are expected to **throw** rather than silently pass a raw string to Mongo.
