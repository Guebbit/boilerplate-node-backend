---
source: src/infrastructure/persistence/create-repository.ts
sha256: 45a21ef3cde276abc8131dd9d94eeda17f4ca6b3468184ab2f40ae2ce5003d61
generated_at: 2026-09-23T17:49:49.576169+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/create-repository.ts

## Purpose

Generic repository factory that every module's `repository.ts` builds on. It encapsulates Mongoose-specific concerns (ObjectId coercion, lean→normalized mapping, filter-bag → query compilation) behind a single `createRepository` call, so module services never hand-roll `$regex`, `$elemMatch`, or `ObjectId` conversion. Modules consume it via object spread—not `extends`—so a module that cannot honour part of the contract narrows its own type rather than inheriting a method it would have to break.

## Key elements

- **`createRepository<TDocument>(model, options)`** — The factory. Returns a `Repository<TDocument>` object with `findById`, `findOne`, `findByIdRaw`, `findAll`, `count`, `create`, `save`, `build`, `deleteOne`, `search`, `normalize`, and `buildWhere`.
- **`Repository<TDocument>`** — Explicitly written-out return type (avoids TS7056 serialization errors when spread into a module repository). The single reference for what a repository can do.
- **`SearchSpec`** — Per-collection declaration of which filter keys map to which Mongo paths, and how (objectId, exact, boolean, regex, arrayRegex, text, ranges). Keeping this declarative pushes `$regex`/`$elemMatch`/`$gte` out of services.
- **`FindAllOptions`** — Optional `sort`, `skip`, `limit` (defaults to `FIND_ALL_LIMIT = 1000`) for `findAll` pagination.
- **`PaginatedResult<TDocument>`** — `{ items, meta }` shape returned by `search`.
- **`RepositoryOptions`** — Takes a `SerializeTransform` (from `./serialize`) and an optional `SearchSpec`.
- **`Lean<TDocument>`** — Type helper: what `.lean()` actually returns (strips `Document` instance methods and `id` virtual, restores `_id`).
- **`toObjectId(value)`** — Coerces a value to `Types.ObjectId`; throws on malformed input (safe direction vs. silent empty results in aggregation `$match`).
- **`buildWhere(filters, spec)`** — (private) Compiles a filter bag into a Mongo query per the declared `SearchSpec`. Exposed on the factory result as `repository.buildWhere` for building aggregation `$match` stages.
- **`isPresent(value)`** — (private) Treats `undefined`/`null`/empty/whitespace strings as "filter not supplied."

## Relationships

- **`src/infrastructure/persistence/search.ts`** — Provides `normalizePagination`, `buildPaginatedMeta`, `addTextFilter`, `addRegexFilter`, `toSearchPattern`, `DEFAULT_SORT`, and the `PaginatedMeta`/`PaginationInput` types. `createRepository` delegates all query-text and pagination logic here.
- **`src/infrastructure/persistence/metrics.ts`** — Provides `trackDatabaseQuery`, called inside the factory to instrument every query it issues.
- **`src/infrastructure/persistence/serialize.ts`** — Provides the `SerializeTransform` type that `RepositoryOptions.transform` must conform to; applied by `normalize` and therefore by `search`.
- **Module repositories** (`addresses`, `api-keys`, `audit-logs`, `cart`, `delivery`, `feedback`, `inventory`) — Each spreads `createRepository` into its own repository object and optionally adds domain-specific methods or narrows types.
- **Module services** (`api-keys/services/api-keys.ts`, `audit-logs/service.ts`, `cart/services/checkout.ts`, `feedback/service.ts`) — Consume the typed repository; never see Mongoose `Query` objects or raw Mongo operators.
- **`src/modules/account/tests/unit/two-factor.test.ts`** — Exercises repository-backed code paths in the account module.

## Notes

- **Spread, not inheritance.** The factory result is an object literal. A module that needs to override or drop a method re-declares it in its own object rather than using `extends`/`implements`. This is deliberate to avoid protected-hook complexity.
- **`findByIdRaw` vs `findById` vs `search`.** `findByIdRaw` returns a lean object *without* the transform (keeps `_id`/`__v`); `findAll` likewise skips normalization. Only `search` applies the wire-shape transform. Use `findByIdRaw` when embedding a snapshot in another document.
- **Boolean filters are not re-coerced.** `SearchSpec.booleans` expects a real `boolean` in the bag. Controllers are responsible for decoding `'true'`/`'false'` strings first; re-coercing in the repository would mask a controller bug.
- **Regex inputs are always escaped.** `addRegexFilter` and `toSearchPattern` both sanitize; passing raw user text into `$regex` without them is a public ReDoS vector.
- **`buildWhere` is also exposed publicly** on the returned object so that aggregation pipelines can reuse the same filter rules for their `$match` stage.
- **`FIND_ALL_LIMIT` is a backstop, not a page size.** Actual pagination belongs in `search`; `findAll` just prevents an unbounded scan if a caller forgets to set `limit`.
- **`toObjectId` throws on bad input.** This is intentional: in an aggregation `$match` a raw string matches nothing (silently wrong), whereas a thrown error surfaces as a 422 about the specific request.
