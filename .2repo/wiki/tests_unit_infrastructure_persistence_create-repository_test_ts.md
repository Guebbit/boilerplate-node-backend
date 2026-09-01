# tests/unit/infrastructure/persistence/create-repository.test.ts

## Purpose

Unit tests for the `buildWhere` method returned by `createRepository`, which compiles a caller's filter bag into a MongoDB query object. The tests are pure and DB-free: the Mongoose model is a stub that is never invoked, so the suite isolates the id-coercion, blank/empty handling, and per-kind compilation rules (objectIds, exact, booleans, regex, arrayRegex, text, ranges) without any database or Mongoose internals.

## Key elements

- **`buildWhereFor(searchable)`** — factory helper that calls `createRepository` with a stub model, an identity transform, and the given `SearchSpec`, then returns the resulting `buildWhere` function. This is the single entry point every `describe` block uses.
- **`stubModel`** — `{} as Model<FixtureDocument>`; satisfies the type contract but is never called.
- **`identityTransform`** — pass-through `(item) => item` so no projection logic interferes.
- **`FixtureDocument`** — minimal `Document` interface (`name: string`) used to satisfy generic constraints.
- **`describe` blocks** — one per `SearchSpec` kind (`objectIds`, `exact`, `booleans`, `regex`, `arrayRegex`, `text`, `ranges`), plus a "composing multiple kinds" block that asserts independent paths don't clobber each other.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — the sole production dependency. The test imports `createRepository` (value) and `SearchSpec` (type) from this module and exercises the `buildWhere` it returns. No other production code is imported.

## Notes

- Every `it` block that exercises "absent/blank" behavior asserts the path is **omitted** from the returned object (not set to `null`/`undefined`), which matters for downstream query composition.
- The `booleans` kind is intentionally stricter than a presence check: only literal `true`/`false` pass; the string `'false'` is dropped. This is a deliberate design choice documented inline.
- The `ranges` kind parses string inputs to numbers and silently drops non-numeric bounds (no `NaN` reaches Mongo).
- `regex` and `arrayRegex` escape special characters and always set `$options: 'i'`; `arrayRegex` additionally wraps in `$elemMatch`.
- The "text with no declared fields" case guards against an empty `$or` array being emitted when `text: []` is configured.
