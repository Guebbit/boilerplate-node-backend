---
source: src/infrastructure/surfaces/create-list-controller.ts
sha256: 02cc78b5d6ace8ae31d98a1a42044df0452e976f41b596620762db21b8aad37e
generated_at: 2026-11-08T03:50:58.843119+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/surfaces/create-list-controller.ts

## Purpose

Factory that builds an Express handler for a paged list endpoint. The flow is fixed: read the query string via `readInput(surface: 'list')` → validate against a Zod schema with `parseBody` → call the module's `runList` → send the result through `successResponse`. It exists so that each module's list controller only supplies the things that differ (entity name, schema, runList) instead of re-implementing the plumbing.

## Key elements

- **`ListControllerSpec<TSchema, TResult>`** — the per-entity configuration: `entity` (plural camelCase string used to derive the operation name), `schema` (the generated query schema, expected to be `.partial()`), optional `input` (extra typed query fields, omitting `surface`), and `runList` (the service call that returns the bare payload).
- **`createListController(spec)`** — the exported factory. Returns a named Express handler that wires `readInput` → `parseBody` → `runList` → `successResponse`, with `catchAs` handling failures (logs under the operation name, responds 500).

## Relationships

- **`src/infrastructure/http/controller.ts`** — provides `namedHandler`, `operationName`, `parseBody`, and `catchAs`, which this file composes into the handler pipeline.
- **`src/infrastructure/http/request.ts`** — provides `readInput` and the `RequestInputDeclaration` type; called with `surface: 'list'` to extract and merge the query string.
- **`src/infrastructure/http/response.ts`** — provides `successResponse`, which serialises the `runList` result into the HTTP body.
- **Module controllers** (e.g. `get-inventory-levels.ts`, `get-api-keys.ts`, `get-returns.ts`, `get-audit.ts`, `get-preorder-fulfillment-orders.ts`, `get-preorder-levels.ts`, `get-stock-movements.ts`, `get-observability-audit.ts`, `get-deliveries.ts`, `get-subscriptions.ts`) — each calls `createListController` with its own spec to produce its route handler.

## Notes

- `schema` **must** be `.partial()` so absent fields remain absent; `normalizePagination` (inside `readInput`) owns applying defaults. A non-partial schema would let `parseBody` treat missing fields as a validation error.
- `runList` must return the **bare payload**. `successResponse` wraps it; a service that pre-wraps its own envelope would double-wrap.
- `entity` is always plural and camel-cased (e.g. `inventoryLevels`). It is interpolated into `operationName('get', entity)` to produce the operation identifier (`getInventoryLevels`) used in logs, stack traces, and generated docs tables.
- Kept as a separate file from `createSearchController` (the search sibling) because a list endpoint has no request body. Merging them would require a `surface` knob on a factory whose sole purpose is deciding *where* input comes from.
