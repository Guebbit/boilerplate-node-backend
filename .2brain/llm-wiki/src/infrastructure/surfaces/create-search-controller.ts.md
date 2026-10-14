---
source: src/infrastructure/surfaces/create-search-controller.ts
sha256: d7bdcad04fb2707aa16eda40475d405fad97dc8bf465d2f9ab4b29ba3496e8aa
generated_at: 2026-10-14T08:19:21.105481+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/surfaces/create-search-controller.ts

## Purpose

Factory that produces a single Express handler for modules exposing both `GET /x` and `POST /x/search` behind one controller. It standardises the request→validate→search→respond pipeline so each module only supplies its own schema, optional input overlay, and search implementation.

## Key elements

- **`SearchControllerSpec<TSchema, TResult>`** (interface) — the per-module contract: `entity` (plural name used to derive the operation label), `schema` (Zod schema for the merged input), optional `extendInput` (overlay for coercions/request-derived values), and `runSearch` (the actual query).
- **`mergedSearchInput(request, extendInput?)`** (exported function) — calls `readInput` with the `search` surface rules (`stringArrays: ['id']`, `csvLists: ['sort']`) and then applies the module's `extendInput` overlay. Exported separately so the response-cache layer can build its key from the exact same value the controller will validate.
- **`createSearchController(spec)`** (exported factory) — returns a `namedHandler` that: merges input → `parseBody` against the schema (422 on failure) → `runSearch` → `successResponse`, with errors funneled through `catchAs` under the derived operation name (e.g. `getProducts`).

## Relationships

- **`@infrastructure/http/controller`** — provides `namedHandler`, `operationName`, `parseBody`, and `catchAs`; the core request-lifecycle primitives this factory composes.
- **`@infrastructure/http/request`** — provides `readInput`, which performs the surface-specific parameter/query/body merge before validation.
- **`@infrastructure/http/response`** — provides `successResponse`, used to serialise the search result back to the client.
- **Module controllers** (`get-products`, `get-orders`, `get-payments`, `get-refunds`, `get-users`, `get-examples`, `get-feedback`, `get-orders-export`) — each is a concrete consumer that calls `createSearchController` with its own `SearchControllerSpec`.
- **`tests/unit/infrastructure/surfaces/create-search-controller.test.ts`** — unit tests for the factory and `mergedSearchInput`.

## Notes

- `id` is deliberately registered as `stringArrays`, **not** `ids`. `ids` collapses repeated keys to the first value (correct for single-row `update`/`delete`), but would silently drop `?id=a&id=b` down to `?id=a` in a batch search.
- `sort` uses `csvLists`, which splits only the *query-string* CSV form. A body-supplied CSV string is left intact and rejected by the schema's enum rather than silently accepted as an array.
- `extendInput` receives the already-merged `readInput` result plus the raw Express `Request`; it must return **only** the overlay object, not a full replacement.
- The operation name is derived as `get` + entity (e.g. `getProducts`) and appears in stack traces, request-log lines, and the generated `docs/modules/` tables — changing `entity` affects all three.
