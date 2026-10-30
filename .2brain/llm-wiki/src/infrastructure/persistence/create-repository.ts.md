---
source: src/infrastructure/persistence/create-repository.ts
sha256: 2a8133b30ca5bc916299be585f5f86935944e516c0ffac3709657c7f1961f4de
generated_at: 2026-10-29T02:12:31.611777+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/create-repository.ts

## Purpose

Generic repository factory that every module's `repository.ts` spreads into its own object. It builds CRUD and search against a Mongoose model plus a declarative `SearchSpec`, so individual modules never hand-roll `$regex`/`$elemMatch`/`ObjectId` conversion or the lean→normalized mapping.

## Key elements

- **`Lean<TDocument>`** / **`Wire<TDocument>`** — Type helpers: what `.lean()` returns, and the wire shape after the `_id`→`id` rename.
- **`SearchSpec`** — Declarative mapping of filter keys to Mongo paths, covering `objectIds`, `exact`, `booleans`, `regex`, `arrayRegex`, `text`, `sortable`, `ranges`, `dateRanges`, and `presence`.
- **`buildWhere(filters, spec)`** — Compiles a flat filter bag into a Mongo query document per the spec. Handles `$in`/equality for ObjectIds, `$elemMatch` for arrays, one-sided ranges, date ranges, and boolean presence checks.
- **`toObjectId(value)`** — Coerces to `Types.ObjectId`; throws on malformed input (safe for aggregation `$match`).
- **`isPresent(value)`** — Treats `undefined`/`null`/blank strings as "no filter."
- **`toDate(value)`** — Parses to `Date` or returns `undefined` for absent/unparseable input.
- **`FindAllOptions`** — `sort`, `collated`, `skip`, `limit` (defaults to `FIND_ALL_LIMIT = 1000`).
- **`RepositoryOptions`** — `transform: SerializeTransform` and optional `searchable: SearchSpec`.
- **`Repository<TDocument, TWire>`** — Explicitly written-out return interface (`findById`, `findOne`, `findByIdRaw`, `findAll`, `search`, `create`, `update`, `delete`). Written out because Mongoose's `Query` generics trigger TS7056 when inferred at an export boundary.
- **`PaginatedResult<TWire>`** — `{ items: TWire[]; meta: PaginatedMeta }`.

## Relationships

- **`./search`** — Imports `normalizePagination`, `buildPaginatedMeta`, `addTextFilter`, `addRegexFilter`, `toSearchPattern`, `DEFAULT_SORT`, `withTiebreaker`, `SORT_COLLATION`, `sortOf`, and `PaginatedMeta` for the `findAll`/`search` paths.
- **`./versioning`** — Imports `checkedDelete` and `fencedSave` (plus `DeleteOutcome`) for optimistic-concurrency-guarded writes.
- **`./serialize`** — Imports the `SerializeTransform` type; the factory applies it via `normalize` so callers receive already-serialized wire objects.
- **Module repositories** (`account`, `addresses`, `api-keys`, `audit-logs`, `cart`, …) — Spread the factory result into their own repository object; no inheritance or protected hooks.
- **`scripts/mutation/ci/cli.ts`** — Reaches the repository directly for ops/mutation workflows (noted as a consumer in the dependency graph).

## Notes

- **No Query leakage:** `findById` returns a `Promise<TDocument>`, not a Mongoose `Query`. A Query escaping the repository would let any caller chain `.select()`/`.lean()`, breaking the layering the factory enforces.
- **`.lean()` skips `toJSON`:** Because `.lean()` and `.aggregate()` bypass the schema hook, results still carry `_id`/`__v`; the `transform` in `RepositoryOptions` is what produces the wire shape.
- **Filter bag typed as `object`:** Deliberately not `Record<string, unknown>` — generated request DTOs are interfaces without an implicit index signature, and a stricter type would force casts at every call site. The single internal cast is confined to `buildWhere`.
- **Boolean filters are pre-decoded:** The spec expects real booleans; controllers decode query-string `"false"` → `false` before the repository sees it. The repository's `typeof === 'boolean'` check is a guard, not a coercion.
- **Regex is always escaped:** `addRegexFilter` and `toSearchPattern` escape user input to prevent ReDoS via unescaped `$regex`.
- **`toObjectId` throws, not returns `undefined`:** A malformed id in a batch (`$in`) still throws per element, surfacing a 422 rather than a silently empty page.
- **`FIND_ALL_LIMIT` (1000) is a backstop, not a page size:** Actual paging goes through `search`.
