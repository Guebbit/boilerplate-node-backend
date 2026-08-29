# tests/unit/infrastructure/persistence/base-repository.test.ts

## Purpose

Unit tests for `createBaseRepository(...).buildWhere`, the filter-bag-to-Mongo-query compiler that every module's `search()` calls. The tests are pure and DB-free: a stub model is passed in and never invoked, so the suite validates only the id-coercion, empty/blank handling, and per-kind compilation rules defined in `base-repository.ts`.

## Key elements

- **`buildWhereFor(searchable: SearchSpec)`** – helper that wires a stub model, an identity `transform`, and a given `SearchSpec` into `createBaseRepository`, returning the bound `buildWhere` function.
- **`describe('buildWhere — objectIds')`** – verifies ObjectId coercion at declared paths, whitespace trimming before coercion, omission for absent/empty/blank values, throwing on malformed ids, and independent coercion of multiple declared keys.
- **`describe('buildWhere — exact')`** – confirms trimmed verbatim string matching and omission for absent/blank.
- **`describe('buildWhere — booleans')`** – asserts only literal `true`/`false` produce a filter; non-boolean values (e.g. `'false'`) are omitted.
- **`describe('buildWhere — regex')`** – checks case-insensitive, special-character-escaped `$regex`/`$options: 'i'` output and omission when blank.
- **`describe('buildWhere — arrayRegex')`** – confirms the escaped pattern is wrapped in `$elemMatch`.
- **`describe('buildWhere — text')`** – verifies an `$or` array is built across all declared fields with a single escaped pattern; also confirms an empty `text: []` spec never emits `$or`.
- **`describe('buildWhere — ranges')`** – tests `$gte`/`$lte` for min/max, one-sided bounds, dropping of non-numeric bounds (no `NaN` sent to Mongo), and full omission when neither bound is present.
- **`describe('buildWhere — composing multiple kinds at once')`** – asserts that `exact`, `booleans`, and `ranges` filters coexist without clobbering each other.

## Relationships

- **`src/infrastructure/persistence/base-repository.ts`** – the sole production dependency. The test imports `createBaseRepository` and the `SearchSpec` type, then exercises only the returned `buildWhere` method. No other exports from that module are tested here.
- **`mongoose`** – `Types.ObjectId` is used in assertions for the `objectIds` kind; `Model` and `Document` are imported as types only to satisfy the `createBaseRepository` generic signature.

## Notes

- The `stubModel` is `{} as Model<FixtureDocument>`; no Mongoose method is ever called. Any test that accidentally triggers a model call would fail with a `TypeError`, not a meaningful assertion.
- The `transform` passed to `createBaseRepository` is always `identityTransform`; document-shape mapping is explicitly out of scope for this file.
- Boolean filtering is intentionally stricter than a truthy check: a pre-decoded literal is required, so a raw query-string `"false"` is treated as absent.
- `objectIds` coercion *throws* on a malformed string rather than passing it through, guarding against un-matched raw strings reaching a Mongo query.
- Range bounds that are non-numeric are silently dropped (resulting in `{}` or a one-sided filter), never serialized as `NaN`.
