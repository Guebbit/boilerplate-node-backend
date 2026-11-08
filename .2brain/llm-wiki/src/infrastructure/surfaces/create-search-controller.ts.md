---
source: src/infrastructure/surfaces/create-search-controller.ts
sha256: d7bdcad04fb2707aa16eda40475d405fad97dc8bf465d2f9ab4b29ba3496e8aa
generated_at: 2026-11-08T03:51:20.905800+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/surfaces/create-search-controller.ts

## Purpose
Factory that builds a ready-to-mount Express handler for a module's `POST /x/search` endpoint. Every list-and-search module (products, orders, tasks, etc.) plugs in its own entity name, Zod schema, optional input overlay, and search function; everything else—input reading, validation, response shaping, error handling—is shared here.

## Key elements
- **`SearchControllerSpec<TSchema, TResult>`** — The per-module contract: `entity` (plural noun, drives the operation name), `schema` (Zod), optional `extendInput` (overlay of request-derived/coerced values), and `runSearch` (the actual query).
- **`mergedSearchInput(request, extendInput?)`** — Reads the request with the `search` surface rules (`stringArrays: ['id']`, `csvLists: ['sort']`), then applies the module's overlay. Exported separately so the response cache can key on the exact pre-validation value the controller will use.
- **`createSearchController(spec)`** — Returns a `namedHandler` that: merges input → `parseBody` against the schema (422 on failure) → `runSearch` → `successResponse`; failures are logged and 500'd via `catchAs` under the derived operation name (e.g. `getProducts`).

## Relationships
- **`src/infrastructure/http/controller.ts`** — Source of `catchAs`, `namedHandler`, `operationName`, and `parseBody` (validation + error wrapping).
- **`src/infrastructure/http/request.ts`** — Source of `readInput`, which merges params/query/body into one object per the `search` surface's rules.
- **`src/infrastructure/http/response.ts`** — Source of `successResponse` for the happy-path JSON reply.
- **Module controllers** (`get-products.ts`, `get-orders.ts`, `get-tasks.ts`, `get-users.ts`, `get-payments.ts`, `get-refunds.ts`, `get-examples.ts`, `get-orders-export.ts`) — Consumers that call `createSearchController` (and often `mergedSearchInput`) with their own spec to wire up their `POST /x/search` route.
- **`tests/unit/infrastructure/surfaces/create-search-controller.test.ts`** — Unit tests covering the factory, `mergedSearchInput` splitting/coercion behaviour, and error paths.

## Notes
- `id` is deliberately routed through `stringArrays` rather than `ids`: search is a batch filter (`?id=a&id=b` must survive), whereas `ids` collapses a repeated key to its first entry (correct for single-row `update`/`delete`).
- `sort` uses `csvLists`: a CSV in the query string is split into an array; a CSV string in the JSON body is left as-is and will be rejected by the schema's enum rather than silently accepted.
- `extendInput` must return **only** the overlay object, not the full merged result; the factory spreads it over the base input. Omit it entirely if a module needs no request-derived values.
- The `entity` string is the single source of truth for the operation name in stack traces, request logs, and the generated `docs/modules/` tables—keep it consistent with the route path.
