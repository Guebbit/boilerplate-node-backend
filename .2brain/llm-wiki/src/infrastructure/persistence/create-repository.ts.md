---
source: src/infrastructure/persistence/create-repository.ts
sha256: 00a3b89dc4d9a99be4196f05734423a6158638980a6cae0bd53b4aeb5226f28f
generated_at: 2026-10-14T08:08:59.363680+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/create-repository.ts

## Purpose

Generic repository factory that provides CRUD operations (findById, findOne, findAll, search, create, update, delete) plus declarative search against a Mongoose model and a `SearchSpec`. Every module's `repository.ts` builds on this factory so that no module hand-rolls `$regex`/`$elemMatch`/`ObjectId` coercion or the lean→normalized wire mapping. Modules spread the factory's result into their own object (no inheritance), so a module that can't honour part of the contract narrows its own type instead of overriding a method.

## Key elements

- **`createRepository`** — the factory function (referenced throughout the module doc and the `Repository` interface). Takes a Mongoose `Model`, a `RepositoryOptions` bag (transform + optional `SearchSpec`), and returns a `Repository<TDocument, TWire>` object.
- **`Repository<TDocument, TWire>`** — the explicitly written return-type interface (avoids a TS7056 inference failure at the export boundary). Declares `findById`, `findOne`, `findByIdRaw`, `findOneRaw`, `findAll`, `search`, `create`, `update`, `delete`, and the bound `buildWhere`.
- **`SearchSpec`** — declarative per-collection filter contract. Maps caller-facing keys to Mongo paths across categories: `objectIds`, `exact`, `booleans`, `regex`, `arrayRegex`, `text`, `sortable`, `ranges`, `dateRanges`, `presence`. Keeps Mongo operator logic out of services.
- **`buildWhere`** (internal) — compiles a filter bag into a Mongo query using the declared `SearchSpec`. Also exposed on the factory result so the order/aggregation path can build a `$match` from the same rules.
- **`Lean<TDocument>`** / **`Wire<TDocument>`** — type helpers for the `.lean()` output shape and the wire shape after the shared `_id`→`id` rename.
- **`toObjectId`** (exported) — coerces a value to `Types.ObjectId`; throws on malformed input (safe direction for aggregation `$match`).
- **`PaginatedResult<TWire>`** — `{ items, meta }` shape returned by `search`.
- **`FindAllOptions`** — pagination/sort options for `findAll` (sort, collated, skip, limit). Limit defaults to `FIND_ALL_LIMIT` (1000).
- **`RepositoryOptions`** — input to `createRepository`: `transform` (from serialize) and optional `searchable` (`SearchSpec`).
- **`isPresent`** / **`toDate`** (internal) — nullish/blank guards used by `buildWhere`.

## Relationships

- **`./search`** — imports `normalizePagination`, `buildPaginatedMeta`, `addTextFilter`, `addRegexFilter`, `toSearchPattern`, `DEFAULT_SORT`, `SORT_COLLATION`, `sortOf`, and the `PaginatedMeta` type. All search/query-building helpers used by `buildWhere` and `findAll` come from here.
- **`./versioning`** — imports `checkedDelete`, `fencedSave`, and `DeleteOutcome`. The factory's `create`/`update`/`delete` path delegates to these for optimistic-concurrency guards.
- **`./serialize`** — imports the `SerializeTransform` type. The `transform` in `RepositoryOptions` is applied inside `normalize`/`search` to produce wire-shaped results.
- **Module repositories** (`src/modules/account/repository.ts`, `addresses/repository.ts`, `api-keys/repository.ts`, `audit-logs/repository.ts`, `cart/repository.ts`, `delivery/repository.ts`) — each calls `createRepository` with its Mongoose model and a `SearchSpec`, then spreads the result into its module-specific repository object.
- **Module services** (`api-keys/services/api-keys.ts`, `audit-logs/service.ts`, `cart/services/preorder.ts`, `cart/services/shelf.ts`, `cart/services/view.ts`) — consume the repositories built on this factory; they pass filter bags that `buildWhere` interprets per the declared `SearchSpec`.
- **`scripts/mutation/ci/cli.ts`** — reaches repositories directly (bypassing the HTTP layer) for mutation-testing CI; relies on the same `createRepository`-produced interfaces.

## Notes

- **No inheritance by design.** The factory returns a plain object; modules spread it. A module that can't fulfil a method narrows its own type rather than overriding. This is intentional to avoid a "protected hook" pattern.
- **`findAll` is not paginated search.** It is a backstop-bounded (≤ 1000) read. Actual paging goes through `search()`.
- **Booleans must arrive pre-decoded.** `SearchSpec.booleans` checks `typeof === 'boolean'`, not truthiness. Controllers are responsible for coercing `"false"` → `false` before the value reaches the repository.
- **`toObjectId` throws on bad input.** This is deliberate: an aggregation `$match` with a raw string silently matches nothing, which would mask a 422 as an empty result.
- **`buildWhere` uses `object` (not `Record<string, unknown>`) for the filter bag.** Generated request DTOs are interfaces without an implicit index signature; the single `as` cast is confined to this function.
- **`_id` is explicitly restored in `Lean`.** `Omit<T, keyof Document>` would otherwise strip `_id` alongside `save`/`toObject`/`isNew`; `Pick<T, '_id'>` puts it back.
- **`.lean()` skips virtuals.** A lean read never has the `id` virtual, which is why `Wire` adds `id: string` manually.
