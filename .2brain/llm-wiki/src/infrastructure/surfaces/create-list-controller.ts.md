---
source: src/infrastructure/surfaces/create-list-controller.ts
sha256: 02cc78b5d6ace8ae31d98a1a42044df0452e976f41b596620762db21b8aad37e
generated_at: 2026-10-29T02:17:21.947320+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/surfaces/create-list-controller.ts

## Purpose

Factory that produces a single Express handler for any paged list endpoint (`GET /x`). It standardises the pipeline — read the query string, validate against a Zod schema, run the module's service call, and send the result or a 500 — so each entity only supplies its schema and query logic. Kept separate from `createSearchController` because a list has no request body, whereas a search reads the body first; conflating the two would require a `surface` knob inside a factory whose sole concern is *where* input comes from.

## Key elements

- **`ListControllerSpec<TSchema, TResult>`** — Input interface the caller fills in:
  - `entity` — camelCase plural name (e.g. `'inventoryLevels'`); drives the generated operation name (`getInventoryLevels`).
  - `schema` — Zod query schema (typically `.partial()` of a generated schema) used to validate the merged query input.
  - `input` — Optional `RequestInputDeclaration` (minus `surface`) for fields a plain query string can't type.
  - `runList` — Async function that receives the validated input and the raw `Request`, returns the bare payload.
- **`createListController`** — The exported factory. Returns an Express handler wrapped in `namedHandler(operation, …)` that:
  1. Calls `readInput(request, { …input, surface: 'list' })` to build the input object.
  2. Validates via `parseBody(schema, …)`; on failure responds 422 and returns.
  3. Awaits `runList(parsed, request)` and sends the result with `successResponse`.
  4. Catches any rejection with `catchAs(response, operation)` (logs under the operation name, then 500).

## Relationships

- **`@infrastructure/http/controller`** (`src/infrastructure/http/controller.ts`) — Imports `catchAs`, `namedHandler`, `operationName`, `parseBody`; provides the naming, wrapping, validation, and error-respond helpers the factory delegates to.
- **`@infrastructure/http/request`** (`src/infrastructure/http/request.ts`) — Imports `readInput` and the `RequestInputDeclaration` type; `readInput` with `surface: 'list'` merges the query string (and any extra declared fields) into one object before validation.
- **`@infrastructure/http/response`** (`src/infrastructure/http/response.ts`) — Imports `successResponse`; the single way a successful payload is written to the HTTP response.
- **Module list controllers** (`list-api-keys`, `get-audit`, `get-preorder-fulfillment-orders`, `get-inventory-levels`, `get-preorder-levels`, `get-stock-movements`, `get-observability-audit`, `get-returns`, `list-deliveries`, `list-subscriptions`) — Each calls `createListController` with its own `entity`, `schema`, and `runList` to obtain the handler it mounts on its route.

## Notes

- The `entity` string is the single source of truth for the operation name. It appears in stack traces, log lines, and the generated tables under `docs/modules/` — keep it consistent with the route path.
- `runList` must return the **bare payload**; `successResponse` wraps it in the HTTP body. Pre-wrapping inside the service double-wraps the response.
- The schema should be `.partial()` so that absent pagination fields remain `undefined`, letting `normalizePagination` (applied inside the module's service) own the defaults.
- The handler returns `Promise.resolve()` (void) on validation failure after `parseBody` has already sent the 422 — it does not throw, so no further `.catch` runs.
