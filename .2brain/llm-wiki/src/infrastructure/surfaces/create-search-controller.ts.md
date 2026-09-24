---
source: src/infrastructure/surfaces/create-search-controller.ts
sha256: 1247a7e0dd635af16bf5b71c34e74d779d428c3fd6fc287b92611c70c66fa544
generated_at: 2026-09-23T17:53:59.203869+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/surfaces/create-search-controller.ts

## Purpose
Factory that builds a standardised search controller (a single Express handler) shared by the `products`, `users`, and `orders` modules. Each module supplies only its entity name, Zod schema, optional input overlay, and search logic; everything else—input reading, validation, response shaping, error handling—is handled here. The `feedback` module intentionally does **not** use this factory.

## Key elements
- **`SearchControllerSpec<TSchema, TResult>`** — Interface describing what varies per entity: `entity` (plural name used to derive the operation string), `schema` (Zod validation schema), `extendInput?` (optional overlay function for coercions/request-derived values), and `runSearch` (the module's actual search, receiving validated input and the raw `Request`).
- **`createSearchController`** — The exported factory. Calls `operationName('get', entity)` to produce a name like `getProducts`, then returns a `namedHandler` that: reads input via `readInput` (surface `'search'`, `stringArrays: ['id']`), applies `extendInput` if present, validates with `parseBody`, executes `runSearch`, responds with `successResponse`, and funnels rejections into `catchAs`.

## Relationships
- **`src/infrastructure/http/controller.ts`** — Imports `catchAs`, `namedHandler`, `operationName`, `parseBody` for handler naming, validation, and error handling.
- **`src/infrastructure/http/request.ts`** — Imports `readInput` to normalise params/query/body into a single record under the `'search'` surface rules.
- **`src/infrastructure/http/response.ts`** — Imports `successResponse` for the 200 reply path.
- **`src/modules/products/controllers/get-products.ts`**, **`src/modules/users/controllers/get-users.ts`**, **`src/modules/orders/controllers/get-orders.ts`** — Consumer modules that each call `createSearchController` with their own spec to expose `GET /x` and `POST /x/search`.
- **`src/modules/feedback/controllers/get-feedback.ts`** — Explicitly *not* a consumer; documented in the file's module comment as an intentional exclusion.
- **`tests/unit/infrastructure/surfaces/create-search-controller.test.ts`** — Unit tests for this factory.

## Notes
- `id` is passed through `stringArrays` rather than `ids`. The `ids` helper collapses repeated query keys to the first value (correct for single-row `update`/`delete`), but search needs batch filtering where `?id=a&id=b` must stay a two-element array.
- `extendInput` returns **only** the overlay fields, not the full merged object; the factory spreads it over the `readInput` result. Omit it entirely when a module needs no extra coercion.
- The operation name (`getProducts`, etc.) is the single source of truth for stack-trace labels, request-log lines, and the generated `docs/modules/` tables—changing `entity` changes all of those.
