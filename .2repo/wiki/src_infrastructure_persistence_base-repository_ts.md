# src/infrastructure/persistence/base-repository.ts

## Purpose

Factory (`createBaseRepository`) that produces a uniform CRUD + search object for any Mongoose model. It centralises three pieces of Mongo knowledge that services must not carry: `ObjectId` coercion, lean→normalised key mapping, and filter-bag→query compilation. It is a closure factory consumed by **spread**, not a base class — modules that cannot honour the full contract (e.g. `orders` omits `search`, `audit-logs` exposes only three members) narrow their own type instead of inheriting a method they'd have to break.

## Key elements

- **`createBaseRepository<TDocument>(model, options)`** — The factory. Accepts a Mongoose `Model` and a `BaseRepositoryOptions` (`transform` + optional `searchable: SearchSpec`). Returns a `BaseRepository<TDocument>` object.
- **`BaseRepository<TDocument>`** — Explicitly-written interface (not inferred; Mongoose's `Query` generics trigger TS7056 at an export boundary). Defines: `findById`, `findOne`, `findByIdRaw`, `findAll`, `count`, `create`, `save`, `deleteOne`, `search`, `normalize`, `buildWhere`.
- **`SearchSpec`** — Declarative mapping of filter keys → Mongo paths, categorised as `objectIds`, `exact`, `booleans`, `regex`, `arrayRegex`, `text`, `ranges`. Each repository declares its own spec; services only say *what* to filter, never *how*.
- **`SearchFilters`** — Typed as bare `object` (not `Record<string, unknown>`) so generated request-DTO interfaces don't need an index-signature cast. The single `as Record<string, unknown>` cast is confined to `buildWhere`.
- **`Transform`** — A `(Record<string, unknown>) => Record<string, unknown>` function (e.g. `applyProductTransform`) that rewrites `_id`→`id` etc. Applied by `normalize` and thus by `search`.
- **`PaginatedResult<T>`** — `{ items: TDocument[]; meta: PaginatedMeta }`, the return shape of `search`.
- **`FindAllOptions`** — Optional `sort`, `skip`, `limit` for `findAll`. Limit defaults to `FIND_ALL_LIMIT`.
- **`FIND_ALL_LIMIT`** (= 1000) — Backstop ceiling when `findAll` is called without an explicit limit; not a page size.
- **`toObjectId(value)`** — Coerces to `Types.ObjectId`; throws on malformed input (safe direction: an aggregation `$match` with a raw string silently matches nothing).
- **`buildWhere(filters, spec)`** (private, exposed via the factory) — Compiles the filter bag into a Mongo query per the declared `SearchSpec`. Escapes all regex input (ReDoS), strips control characters for `arrayRegex`, and drops `NaN` range bounds.

## Relationships

- **`./search`** — Provides `normalizePagination`, `buildPaginatedMeta`, `addTextFilter`, `addRegexFilter`, `toSearchPattern`, `DEFAULT_SORT`, and the `PaginatedMeta` / `PaginationInput` types. `search()` and `findAll` delegate pagination and filter-building to these helpers.
- **`./serialize`** — Authority on each collection's wire-shape transform. The `Transform` passed into the factory is one of the functions exported there (e.g. `applyProductTransform`); this file applies it but does not define it.
- **`./seed`** — Calls `create` on a repository with `{ timestamps: false }` so a fixture's pinned `createdAt` is not overwritten.
- **Module repositories** (`account`, `audit-logs`, `cart`, `delivery`, `feedback`, `inventory`, `locales`, `orders`, `payments`) — Each calls `createBaseRepository` and spreads the result, optionally narrowing or adding members. `orders` additionally calls the exposed `buildWhere` to construct an aggregation `$match` from the same `SearchSpec`.
- **Module services** (`audit-logs/service`, `inventory/service`, `orders/service`) — Consume the repository object returned to the controller layer; they never touch Mongoose directly.

## Notes

- **`search` is the only read path that normalises.** `findByIdRaw` and `findAll` deliberately skip `transform` so the stored `_id` survives — required when embedding a snapshot in another document. `findById` / `findOne` return hydrated documents (mutable, `save`-able) but also untransformed.
- **Booleans are pre-decoded.** `spec.booleans` values must already be `true`/`false` by the time they reach `buildWhere`. Controllers (e.g. `get-users.ts`, `readInput`'s `booleans` helper) handle the string→boolean coercion. `buildWhere` only type-checks with `typeof === 'boolean'`; it does not re-coerce.
- **Explicit "do not base-class" intent.** The file's doc-comment states: *"Do not unify this into a base class."* The spread-consumption pattern is load-bearing; converting to inheritance would force every module to inherit members it can't honour.
- **`BaseRepository` is hand-written, not inferred.** Mongoose's `Query` generics are large enough that TypeScript refuses to serialise the inferred shape at an export boundary (TS7056). The interface doubles as the single readable contract for what a repository can do.
- **Regex safety.** Both `regex` and `arrayRegex` escape user input before building `$regex` patterns. `arrayRegex` additionally routes through `toSearchPattern` (strips control characters like NUL) rather than bare `escapeRegex`, preventing a 500 from a malformed pattern.
- **`SearchFilters` as `object`.** Generated request DTOs are interfaces; TypeScript denies them an implicit index signature. Typing the parameter as `object` (the loosest acceptable) avoids forcing every caller to cast, and confines the single necessary cast to `buildWhere`.
