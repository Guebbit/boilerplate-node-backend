---
source: src/infrastructure/persistence/create-repository.ts
source_sha256: 702190c3185c75322ca0bbb78aad3567a3f1a4ca2fd199175a4ff7ba0af5c5b2
context_sha256: 5bd91a0c53849b20e70578b1b8c2fff7d16a9306548823404e65f48f2d3eff4b
generated_at: 2026-11-22T03:02:12.958105+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/persistence/create-repository.ts

## Purpose
The generic repository factory that every module's `repository.ts` builds on. It provides CRUD plus search against a Mongoose model and a declared `SearchSpec`. This keeps modules from hand-rolling `$regex`/`$elemMatch`/`ObjectId` conversion or the lean→normalized mapping. Modules spread the factory's result into their own repository object (no `extends`, no protected hooks), so a module that can't honour part of the contract narrows its own type.

## Key elements
- **`createRepository`** (configured with `RepositoryOptions`): the factory itself. Its return type is written out explicitly because Mongoose's `Query` generics are too large for TypeScript to serialize at the export boundary (TS7056). The rest of its body is not shown here.
- **`Lean<TDocument>`**: the shape `.lean()` returns. It has the document's own fields and `_id`, but none of `Document`'s instance machinery and no `id` virtual.
- **`Wire<TDocument>`**: `Lean` without `_id` plus a string `id`. This is the shape when `transform` only does the `_id` → `id` rename. Repositories that omit or derive fields compose their own `TWire`.
- **`FindAllOptions`**: `sort`, `collated`, `skip` and `limit` options for `findAll`. The limit defaults to `FIND_ALL_LIMIT` (1000), a backstop against unbounded scans rather than a page size.
- **`SearchSpec`**: declares what a collection can be filtered by, mapping filter key to Mongo path.
  - Filter kinds: `objectIds`, `exact`, `booleans`, `regex`, `arrayRegex`, `text`, `ranges`, `dateRanges` and `presence`.
  - `sortable` lists the wire fields that `sort` may order by. A field not listed there is unsortable.
- **`RepositoryOptions`**: holds `transform` (a `SerializeTransform` applied by `normalize`, and so by `search`) and an optional `searchable` spec.
- **`PaginatedResult<TWire>`**: `{ items, meta }`, where `meta` is a `PaginatedMeta`.
- **`toObjectId(value)`**: coerces to `Types.ObjectId` and throws on a malformed id.
- **`isObjectIdString(id)`**: a type guard that accepts only a string of exactly 24 hex characters. It rejects 12-character strings, numbers and objects with `toString`. The file calls it "the one id check of the codebase".
- **`buildWhere(filters, spec)`**: compiles a filter bag into a Mongo query according to the spec. It is exposed as a bound `buildWhere` on the factory result.

## Relationships
- **`src/infrastructure/persistence/search.ts`**: supplies pagination (`normalizePagination`, `buildPaginatedMeta`, `PaginatedMeta`), the filter helpers (`addTextFilter`, `addRegexFilter`, `toSearchPattern`) and the sort helpers (`DEFAULT_SORT`, `withTiebreaker`, `SORT_COLLATION`, `sortOf`).
- **`src/infrastructure/persistence/versioning.ts`**: imports `checkedDelete`, `fencedSave` and `DeleteOutcome`. Their use is in the part of the file not shown.
- **`src/infrastructure/persistence/serialize.ts`**: supplies the `SerializeTransform` type for the `transform` option of `RepositoryOptions`.
- **Module repositories** (`src/modules/account/repository.ts`, `src/modules/addresses/repository.ts`, `src/modules/api-keys/repository.ts`, `src/modules/audit-logs/repository.ts`, `src/modules/cart/repository.ts`): these build on the factory by spreading its result into their own repository objects. The order repository is named in a comment as using `buildWhere` for aggregation `$match` stages.
- **`src/infrastructure/http/ids.ts`**: not referenced in the visible portion, so its interaction is unconfirmed.
- **`src/infrastructure/persistence/image-writeback.ts`, `src/infrastructure/persistence/translatable-columns.ts`, `src/kernel/access/query.ts`, `scenarios/support/doubles/payments/levers.ts`, `src/modules/audit-logs/service.ts`, `src/modules/cart/services/preorder.ts`**: no interaction is visible in the shown portion.

## Notes
- Empty, blank or nullish filter values are treated as "not filtered". Booleans are the exception, because `false` is a real filter.
- `booleans` and `presence` values must already be real booleans. Controllers decode them first, because `?active=false` arrives as the truthy string `'false'`.
- `presence` maps `true` to `{ $ne: null }` and `false` to `null`, which matches both a missing field and an explicit null.
- In `objectIds`, an array becomes `$in`, a scalar becomes equality, and an empty array means no filter. `toObjectId` throws per element on a malformed id, so a bad id fails the request instead of returning an empty page.
- `arrayRegex` uses `toSearchPattern`, which strips control characters as well as escaping. A NUL byte would otherwise cause a 500. `regex` and the text filter also escape their input, to avoid ReDoS.
- Numeric and date range bounds are independently optional. A non-numeric or unparseable bound is dropped rather than sent to Mongo.
- `toObjectId` throws on a malformed id because an aggregation `$match` does not cast the way `find()` does, so a raw string there would silently match nothing.
- `.lean()` and `.aggregate()` bypass the schema's `toJSON`, which is why `normalize` applies `transform`.
