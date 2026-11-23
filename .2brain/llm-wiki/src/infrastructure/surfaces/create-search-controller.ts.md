---
source: src/infrastructure/surfaces/create-search-controller.ts
source_sha256: f7500fd42e48e1570a223c5b60390606f80eab697181d72b5a6b78babfea1d08
context_sha256: 3ddc820ac468ce8f8667092e9e1b5c8e72ba4768e0ea1931d7f39855b8ab78d4
generated_at: 2026-11-22T03:11:00.915760+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/surfaces/create-search-controller.ts

## Purpose
Provides the shared controller shape for list-and-search modules, each of which exposes `GET /x` and `POST /x/search` through a single controller. The flow is: read input from the `search` surface, overlay module-specific fields, validate against the module's schema, run the search, send a success response, and catch errors. Only the extra query fields and the search itself differ per module.

## Key elements
- **`SearchControllerSpec<TSchema, TResult>`** is the interface describing what varies per entity:
  - `entity`: the plural entity name (e.g. `'products'`). It is used to name the operation (`getProducts`).
  - `schema`: the Zod schema the merged input is validated against.
  - `extendInput?`: an optional `(input, request) => overlay` function. It returns only the fields to overlay (coercions, request-derived values such as an admin check, or a multi-value query param reduced to one), not the whole object.
  - `runSearch`: `(parsed, request) => Promise<TResult>`, the module's own search.
- **`mergedSearchInput(request, extendInput?)`** builds the pre-validation input. It calls `readInput` with `surface: 'search'`, `stringArrays: ['id']` and `csvLists: ['sort']`, then spreads the `extendInput` overlay on top. It is exported so the response cache can key on the same value the controller validates.
- **`createSearchController(spec)`** returns an Express handler wrapped by `namedHandler` under the operation name from `operationName('get', entity)`. On each request it:
  1. Computes the merged input.
  2. Calls `parseBody(schema, merged, response)`. On failure this responds 422 and returns `undefined`, and the handler returns early.
  3. Calls `runSearch`, then `successResponse`.
  4. On a rejection, `catchAs(response, operation)` logs the failure under the operation name and responds 500.

## Relationships
- `@infrastructure/http/controller` supplies `operationName`, `namedHandler`, `parseBody` and `catchAs`.
- `@infrastructure/http/request` supplies `readInput`.
- `@infrastructure/http/response` supplies `successResponse`.
- Module controllers are the consumers: `get-examples`, `get-orders`, `get-orders-export`, `get-payments`, `get-refunds`, `get-products`, `get-tasks` and `get-users`. Each supplies its own entity, schema, optional `extendInput` and `runSearch`.
- `tests/unit/infrastructure/surfaces/create-search-controller.test.ts` covers this file.

## Notes
- `id` goes through `stringArrays`, not `ids`. `ids` collapses a repeated key to its first entry, which would turn `?id=a&id=b` into `?id=a` for a batch filter.
- `sort` is split from CSV only for the query. A CSV in a body is not split, so the schema's enum rejects it.
- A GET request's body is never parsed, so `request.body` is `undefined` there. A body exists only on `POST …/search`.
- The operation name also appears in stack traces, the request log line and the generated `docs/modules/` surface tables, so it should stay consistent with the handler.
