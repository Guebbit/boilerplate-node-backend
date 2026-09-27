---
source: src/infrastructure/persistence/create-repository.ts
sha256: 7be3f30402d163efa27fd45862841577d47637787784dc44a04bfde72a030f33
generated_at: 2026-09-27T14:13:51.603609+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/create-repository.ts

## Purpose

Generic repository factory that every module's `repository.ts` composes. It binds Mongoose CRUD operations and spec-driven search (regex, ObjectId, ranges, presence, text) into a single typed contract, so individual modules never hand-roll query construction or lean→wire normalization. A module spreads the factory's result into its own repository object (composition, not inheritance), narrowing its own type when it can't honour part of the contract.

## Key elements

- **`Lean<TDocument>`** — Type representing what `.lean()` actually returns: the document's own fields minus `Document` machinery, with `_id` restored explicitly.
- **`Wire<TDocument>`** — The default wire shape after a no-op transform: `Lean` minus `_id`, plus a string `id`.
- **`SearchSpec`** — Declarative filter map per collection: `objectIds`, `exact`, `booleans`, `regex`, `arrayRegex`, `text`, `ranges`, `presence`. Services say *what* to filter; this spec encodes *how* it becomes a Mongo query.
- **`FindAllOptions`** — Optional `sort`, `skip`, `limit` (defaults to `FIND_ALL_LIMIT = 1000`).
- **`toObjectId(value)`** — Coerces a string to a BSON `ObjectId`; throws on malformed input (safe for aggregation `$match`).
- **`buildWhere(filters, spec)`** *(internal)* — Compiles a filter bag into a Mongo query object per the declared `SearchSpec`. Handles `$in` batches, case-insensitive regex (ReDoS-escaped), `$elemMatch`, one-sided numeric ranges, and presence checks.
- **`isPresent(value)`** *(internal)* — Treats `undefined`, `null`, and blank strings as "filter absent."
- **`Repository<TDocument, TWire>`** — The explicit return-type interface for the factory: `findById`, `findOne`, `findByIdRaw`, `findAll`, `count`, `create`, `save`, `build`, `deleteOne`, `search`, `aggregate`, and a bound `buildWhere`. Written out (not inferred) to avoid TS7056 at export boundaries.
- **`RepositoryOptions`** — Configuration: `transform` (the model's serializer) and optional `searchable` (`SearchSpec`).
- **`PaginatedResult<TWire>`** — `{ items: TWire[]; meta: PaginatedMeta }`, the return shape of `search`.
- **`createRepository(model, options)`** *(exported factory, body truncated in listing)* — The entry point each module calls.

## Relationships

- **`./search.ts`** — Supplies `normalizePagination`, `buildPaginatedMeta`, `addTextFilter`, `addRegexFilter`, `toSearchPattern`, `DEFAULT_SORT`, and the `PaginatedMeta` type used in `PaginatedResult`.
- **`./metrics.ts`** — Supplies `trackDatabaseQuery`, used to instrument query execution.
- **`./serialize.ts`** — Supplies the `SerializeTransform` type accepted by `RepositoryOptions.transform`.
- **Module repositories** (e.g. `modules/account`, `modules/api-keys`, `modules/cart`, `modules/delivery`, `modules/feedback`, `modules/inventory`, `modules/audit-logs`, `modules/addresses`) — Each calls `createRepository` and spreads the result into its own typed repository object, optionally narrowing or extending methods.
- **Module services** (e.g. `api-keys/services/api-keys.ts`, `cart/services/view.ts`, `feedback/service.ts`, `audit-logs/service.ts`) — Consume the repository's `Repository` interface; they pass filter objects shaped by `SearchSpec` and receive wire-typed results.
- **`modules/account/tests/unit/two-factor.test.ts`** — Exercises repository behavior indirectly through account-module flows.

## Notes

- **No inheritance, no `extends`** — Modules *spread* the factory result. This is deliberate: a module that can't honour a method narrows its own type rather than overriding.
- **`findByIdRaw` / `findAll` return untransformed lean objects** — Only `search` (and `aggregate`) apply the `transform`. Use `findByIdRaw` when embedding a snapshot that must retain `_id`.
- **Boolean filters must be pre-decoded by the controller** — `booleans` in `SearchSpec` expects real `boolean` values; the factory does *not* coerce the string `"false"`. Forgetting to decode in the controller is a 500, not a silent no-op.
- **`buildWhere` accepts `object`, not `Record<string, unknown>`** — Generated request DTOs are interfaces without an implicit index signature; the single cast is confined to `buildWhere`'s first line.
- **Regex inputs are always escaped** — `addRegexFilter` and `toSearchPattern` guard against ReDoS; `arrayRegex` additionally strips control characters (a NUL would cause a 500).
- **`FIND_ALL_LIMIT` (1000) is a backstop, not a page size** — Paging goes through `search`; `findAll` without a limit simply caps at 1000 to prevent unbounded collection scans.
- **`deleteOne` accepts an optional `ClientSession`** — DDD-D6 transaction participation; all pre-existing callers omit it and remain non-transactional.
