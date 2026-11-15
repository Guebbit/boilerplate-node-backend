---
source: src/infrastructure/persistence/create-repository.ts
sha256: 3dcc3591a2005f032487d541df66af1dfe941e30758f0580d68d2f8530921af7
generated_at: 2026-11-14T18:13:26.478113+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/create-repository.ts

## Purpose

Generic repository factory that every module's `repository.ts` builds on. It encapsulates CRUD, search, pagination, and lean→wire normalization against a Mongoose model and a declared `SearchSpec`, so no module hand-rolls `$regex`/`$elemMatch`/`ObjectId` conversion or the lean-to-normalized mapping. Modules spread the factory's result into their own object (no `extends`, no protected hooks); a module that cannot honour part of the contract narrows its own type instead of inheriting a method it must break.

## Key elements

- **`Lean<TDocument>`** — type alias for what `.lean()` actually returns: the document's own fields minus `Document`'s instance machinery and the `id` virtual, with `_id` explicitly preserved.
- **`Wire<TDocument>`** — the wire shape a no-op `transform` produces (`Lean` minus `_id`, plus a string `id`). Repositories with additional derived/omitted fields compose a narrower or wider `TWire`.
- **`SearchSpec`** — per-collection declaration of how filter keys map to Mongo paths and operators (`objectIds`, `exact`, `booleans`, `regex`, `arrayRegex`, `text`, `sortable`, `ranges`, `dateRanges`, `presence`). Keeps `$regex`/`$elemMatch`/`ObjectId` coercion out of services.
- **`toObjectId(value)`** — coerces a value to a BSON `ObjectId`; throws on malformed input (safe direction for aggregation `$match`).
- **`isObjectIdString(id)`** — the codebase's single id-presence check: strict 24-hex string (case-insensitive) via Mongoose's `isObjectIdOrHexString`.
- **`buildWhere(filters, spec)`** — internal; compiles a filter bag into a Mongo query per the declared spec. Handles `$in` for batch ids, `null`/`$ne:null` for presence, escaped `$regex`, `$elemMatch`, the `text` filter via `addTextFilter`, and one-sided numeric/date ranges.
- **`FindAllOptions`** — sort, collation flag, skip, limit (defaults to `FIND_ALL_LIMIT = 1000`).
- **`PaginatedResult<TWire>`** — page of wire-shaped results plus `PaginatedMeta`.
- **`RepositoryOptions`** — `transform` (from `serialize.ts`) and optional `searchable` spec.
- **`createRepository`** — the factory function (truncated in source) that binds the model, spec, and transform into a ready-to-spread repository object exposing `find`, `findAll`, `search`, and versioned save/delete operations (backed by `fencedSave`/`checkedDelete`).

## Relationships

- **`src/infrastructure/persistence/search.ts`** — imports pagination helpers (`normalizePagination`, `buildPaginatedMeta`), filter builders (`addTextFilter`, `addRegexFilter`, `toSearchPattern`), sort constants (`DEFAULT_SORT`, `SORT_COLLATION`, `withTiebreaker`, `sortOf`), and `PaginatedMeta`.
- **`src/infrastructure/persistence/versioning.ts`** — imports `checkedDelete`, `fencedSave`, and `DeleteOutcome` for optimistic-concurrency-safe delete and save.
- **`src/infrastructure/persistence/serialize.ts`** — imports the `SerializeTransform` type applied to `.lean()` results to produce wire shape.
- **`src/modules/account/repository.ts`, `src/modules/addresses/repository.ts`, `src/modules/api-keys/repository.ts`, `src/modules/audit-logs/repository.ts`, `src/modules/cart/repository.ts`** — each spreads the `createRepository` result into its module-specific repository object, supplying its own model, `SearchSpec`, and transform.
- **`src/modules/audit-logs/service.ts`, `src/modules/cart/services/preorder.ts`** — consume the repositories produced above; receive the bound `buildWhere` for aggregation `$match` construction.
- **`src/infrastructure/http/ids.ts`** — upstream id validation at the HTTP boundary; this file's `toObjectId`/`isObjectIdString` are the persistence-layer counterparts.
- **`src/kernel/access/query.ts`** — kernel-level query plumbing that the repository's search path feeds into.
- **`src/infrastructure/persistence/translatable-columns.ts`, `image-writeback.ts`** — sibling persistence concerns that operate alongside this factory (i18n field resolution, image URL writeback) rather than being imported by it directly.
- **`scenarios/support/doubles/payments/levers.ts`** — test doubles that exercise repository contracts in integration scenarios.

## Notes

- Booleans in `SearchSpec.booleans` and `SearchSpec.presence` are expected to arrive **already decoded** (controller or `readInput` coerces them). This file checks `typeof === 'boolean'` and will silently skip a string `'false'` — a forgotten upstream decode is a silent no-op, not an error.
- `toObjectId` **throws** on malformed input. This is intentional: in aggregation pipelines a raw string matches nothing (reads as "no results"), but in `find()` Mongoose may cast it. Throwing surfaces the bad id as a 422 rather than a silent empty page.
- `isObjectIdString` uses the strict `isObjectIdOrHexString` rule (exactly 24 hex chars), not Mongoose's broader `isValid` which also accepts 12-byte binary strings, numbers, and objects with `toString`.
- `FIND_ALL_LIMIT` (1000) is a backstop against unbounded collection scans, **not** a page size — paging goes through `search()`.
- `buildWhere`'s parameter is typed `object` (not `Record<string, unknown>`) because generated request DTOs are interfaces without implicit index signatures; the cast to a readable record is confined to one line inside the function.
- The `createRepository` return type is explicitly written out rather than inferred to avoid TS7056 when the inferred shape is spread into a module repository object.
