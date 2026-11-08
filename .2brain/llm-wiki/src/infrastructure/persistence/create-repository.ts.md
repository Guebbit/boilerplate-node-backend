---
source: src/infrastructure/persistence/create-repository.ts
sha256: 2a8133b30ca5bc916299be585f5f86935944e516c0ffac3709657c7f1961f4de
generated_at: 2026-11-08T03:42:28.263392+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/create-repository.ts

## Purpose

Generic repository factory that every module's `repository.ts` builds on. It provides CRUD, search, and pagination against a Mongoose model plus a declared `SearchSpec`, so individual modules never hand-roll `$regex`/`$elemMatch`/`ObjectId` conversion or lean→normalized mapping. Modules spread the factory's result into their own repository object (no inheritance), allowing any module that can't honour part of the contract to narrow its own type.

## Key elements

- **`Lean<TDocument>`** — type for what `.lean()` actually returns (TDocument fields minus `Document` instance methods and virtuals, with `_id` restored).
- **`Wire<TDocument>`** — type for the default wire shape: `Lean` minus `_id`, plus a string `id`. Modules with extra/derived fields compose their own `TWire` instead.
- **`FIND_ALL_LIMIT`** (1000) — backstop cap for `findAll` when no limit is given; not a page size.
- **`FindAllOptions`** — pagination/sort options (`sort`, `collated`, `skip`, `limit`).
- **`SearchSpec`** — per-collection declaration of what filter keys map to which Mongo paths and how (`objectIds`, `exact`, `booleans`, `regex`, `arrayRegex`, `text`, `sortable`, `ranges`, `dateRanges`, `presence`).
- **`toObjectId`** — exported; coerces a value to `Types.ObjectId`, throwing on malformed input (safe direction for aggregation `$match`).
- **`buildWhere`** — compiles a filter bag into a Mongo query per the `SearchSpec`. Used internally and exposed as a bound method for building aggregation `$match` stages.
- **`PaginatedResult<TWire>`** — `{ items, meta }` shape returned by `search`.
- **`RepositoryOptions`** — `{ transform, searchable? }` passed to the factory.
- **`Repository<TDocument, TWire>`** — the explicit interface for the factory's return type (written out to avoid TS7056 at export boundaries).
- **`createRepository`** — the factory itself (truncated in view); produces the `Repository` object with `findById`, `findOne`, `findByIdRaw`, `findAll`, `search`, `create`, `update`, `delete`, etc.

## Relationships

- **`./search.ts`** — provides pagination helpers (`normalizePagination`, `buildPaginatedMeta`), text/regex filter builders (`addTextFilter`, `addRegexFilter`, `toSearchPattern`), and sort constants (`DEFAULT_SORT`, `withTiebreaker`, `SORT_COLLATION`, `sortOf`).
- **`./versioning.ts`** — provides `checkedDelete` and `fencedSave` used by the factory's delete/save operations.
- **`./serialize.ts`** — provides the `SerializeTransform` type that each module's model supplies for lean→wire normalization.
- **Module repositories** (`account`, `addresses`, `api-keys`, `audit-logs`, `cart`) — each spreads `createRepository`'s result into its own repository object, adding module-specific fields.
- **`cart/services/{preorder,shelf,view}.ts`** and **`audit-logs/service.ts`** — downstream consumers that call the cart and audit-logs repositories.
- **`scripts/mutation/ci/cli.ts`** — reaches repositories directly (e.g., batch reads) outside the normal service layer.

## Notes

- The factory returns a **Promise** from `findById`/`findOne` rather than a Mongoose `Query`, deliberately preventing callers from chaining `.select()`/`.lean()` outside the repository layer.
- `findByIdRaw` returns an **untransformed** plain object (keeps `_id`) for embedding snapshots in other documents.
- Boolean filters (`booleans`, `presence`) are **not** coerced here — controllers must pre-decode (`'false'` string → `false`). A forgotten controller-side decode is a visible bug, not silently masked.
- Regex and array-regex filters escape user input (`addRegexFilter`, `toSearchPattern`) to prevent ReDoS and control-character 500s.
- `buildWhere` accepts `object` (not `Record<string, unknown>`) for the filter bag so generated DTO interfaces don't require casts at call sites; the single cast is confined inside the function.
- `toObjectId` **throws** on malformed ids by design: in aggregation `$match` a raw string matches nothing, so throwing surfaces the bad input as a 422 rather than a silently empty result.
