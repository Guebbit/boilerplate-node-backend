---
source: src/infrastructure/surfaces/create-search-controller.ts
sha256: 4a1f9b65e262d07c83b28387bd3baa15e44de0ed6ed2cd5822084e6193ce605b
generated_at: 2026-11-14T18:19:41.853913+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/surfaces/create-search-controller.ts

## Purpose

Factory that produces a standardized Express search controller for any entity module. It fixes the shared pipeline — `readInput` (surface `'search'`) → optional module overlay → `parseBody` against a Zod schema → module-specific `runSearch` → `successResponse` / `catchAs` — so each entity only supplies its schema, any extra input fields, and the search logic itself.

## Key elements

- **`SearchControllerSpec<TSchema, TResult>`** — interface a module fills in: `entity` (plural name, used to derive the operation name e.g. `getProducts`), `schema` (Zod type), optional `extendInput` (overlay for coercions or request-derived values a plain field list can't express), and `runSearch` (the actual search, receiving validated input + the Express `Request`).
- **`mergedSearchInput(request, extendInput?)`** — builds the raw input object from the request using `readInput` with `surface: 'search'`, `stringArrays: ['id']`, `csvLists: ['sort']`, then applies the module's `extendInput` overlay if present. Exported separately so the response cache can key on the exact value the controller will validate.
- **`createSearchController(spec)`** — returns a named Express handler. Wires `mergedSearchInput` → `parseBody` (422 on failure) → `runSearch` → `successResponse`, with `catchAs` for the 500 path. Operation name is derived as `get<Entity>`.

## Relationships

- **`@infrastructure/http/controller`** — consumes `namedHandler`, `operationName`, `parseBody`, and `catchAs` for handler naming, schema validation, and structured error handling.
- **`@infrastructure/http/request`** — calls `readInput` to merge params/query/body per the `'search'` surface rules.
- **`@infrastructure/http/response`** — calls `successResponse` to emit the 200 payload.
- **Module controllers** (`get-products`, `get-orders`, `get-payments`, `get-refunds`, `get-tasks`, `get-users`, `get-examples`, `get-orders-export`) — each supplies a `SearchControllerSpec` to `createSearchController`, providing their own schema, any `extendInput` overlay, and `runSearch`.
- **`tests/unit/infrastructure/surfaces/create-search-controller.test.ts`** — unit tests for the factory and `mergedSearchInput`.

## Notes

- `id` is parsed via `stringArrays` (preserves `?id=a&id=b` as an array) rather than `ids` (which collapses a repeated key to its first entry — correct for single-row `update`/`delete` but wrong for a batch filter).
- `sort` uses `csvLists`, which splits only the query-string CSV. A CSV sent in the request body is left intact and rejected by the schema's enum, preventing silent acceptance.
- `extendInput` receives the already-merged `readInput` result and the raw `Request`, and must return only the overlay object (it is spread on top, not replacing). Omit it when no coercion or request-derived value is needed.
- The operation name (`get<Entity>`) appears in stack traces, request log lines, and generated `docs/modules/` surface tables — keep the `entity` string consistent with the URL path.
