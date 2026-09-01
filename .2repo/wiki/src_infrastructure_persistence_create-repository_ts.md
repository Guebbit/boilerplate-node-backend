# src/infrastructure/persistence/create-repository.ts

## Purpose

A generic repository factory that every module's `repository.ts` builds on. It centralises Mongoose-specific concerns — `ObjectId` coercion, lean-to-serialized mapping, filter-bag-to-query compilation, and pagination — so that services and module repositories never hand-roll `$regex`, `$elemMatch`, or `ObjectId` conversion. Modules consume it by **spreading** the returned object into their own repository (not via `extends`), so a module that can't honour part of the contract narrows its own type rather than inheriting a method it would have to break.

## Key elements

- **`createRepository<TDocument>`** — the sole factory function. Takes a Mongoose `Model` and a `RepositoryOptions` object (`transform` + optional `searchable` spec), returns a `Repository<TDocument>` with `findById`, `findOne`, `findByIdRaw`, `findAll`, `count`, `create`, `save`, `deleteOne`, `search`, `normalize`, and `buildWhere`.
- **`Repository<TDocument>`** — explicitly written-out return interface (Mongoose's inferred generics are too large for TypeScript to serialize at an export boundary, TS7056).
- **`SearchSpec`** — declarative per-collection filter mapping: `objectIds`, `exact`, `booleans`, `regex`, `arrayRegex`, `text`, `ranges`. Declaring this per repository keeps query-shaping logic out of services.
- **`SearchFilters`** — typed as `object` (not `Record<string, unknown>`) so generated request DTOs (interfaces) can be passed without a cast.
- **`Transform`** — the model's wire-shape serializer; applied by `normalize` and therefore by `search`.
- **`toObjectId`** — exported helper that coerces a string to `Types.ObjectId`; throws on malformed input (safe direction for aggregation `$match`).
- **`buildWhere`** (internal) — compiles a `SearchFilters` bag into a Mongo query object per the declared `SearchSpec`. Exposed on the factory result as `repository.buildWhere` so callers (e.g. the orders module) can reuse it to build an aggregation `$match`.
- **`FIND_ALL_LIMIT`** (= 1000) — backstop ceiling for `findAll` when the caller omits `limit`.
- **`isPresent`** (internal) — treats `undefined`, `null`, and empty/whitespace-only strings as "no filter provided".

## Relationships

- **`src/infrastructure/persistence/search.ts`** — supplies the query-builder helpers this file imports: `normalizePagination`, `buildPaginatedMeta`, `addTextFilter`, `addRegexFilter`, `toSearchPattern`, `DEFAULT_SORT`, and the `PaginatedMeta` / `PaginationInput` types used by `search`.
- **`src/infrastructure/persistence/metrics.ts`** — provides `trackDatabaseQuery`, which the factory calls to record database query metrics.
- **Module repositories** (`account`, `audit-logs`, `cart`, `delivery`, `feedback`, `inventory`, `locales`, `orders`, `payments`, `products`) — each imports `createRepository` (and the shared types) and spreads the result into its own repository object. The **orders repository** additionally calls the exposed `buildWhere` to construct an aggregation `$match` from the same search spec.
- **Module services** (`audit-logs/service.ts`, `inventory/service.ts`, `orders/service.ts`) — consume the repository objects produced by the above module repositories.

## Notes

- `findById` / `findOne` return **hydrated** documents (mutable, `save()`-able); `findByIdRaw` and `findAll` return **lean, untransformed** objects (intentionally keep `_id` for embedded snapshots); `search` is the **only** read path that applies the model's `transform`.
- `SearchFilters` is typed as `object` rather than `Record<string, unknown>` deliberately: generated request DTOs are interfaces and TypeScript rejects an implicit index signature. The single cast to `Record<string, unknown>` is confined to `buildWhere`.
- `booleans` in `SearchSpec` expects the value to already be a `boolean` (controllers / `readInput` decode the string first). `buildWhere` checks `typeof === 'boolean'`, not `isPresent`, because `false` is a valid filter.
- `arrayRegex` uses `toSearchPattern` (not `escapeRegex`) so that control characters like NUL are stripped before the pattern reaches Mongo; an `undefined` result means nothing searchable survived and the filter is omitted.
- The `create` method accepts an optional `SaveOptions` solely for the seeding path (`{ timestamps: false }`) so a fixture's pinned `createdAt` isn't overwritten.
- The file's JSDoc references `docs/tools/mongodb-mongoose.md` for background on the lean/serialization model.
