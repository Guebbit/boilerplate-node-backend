---
source: src/infrastructure/surfaces/create-list-controller.ts
source_sha256: 537a71ca2a5af776f55504558b593601820f89cf3cfbd0787fc044f39bbf7787
context_sha256: 8c734392c0a035ec106f684fde10201323873fa8d1f965815eaf598a593b89b7
generated_at: 2026-11-22T03:10:41.568663+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/surfaces/create-list-controller.ts

## Purpose
A factory that builds the express handler for a paged "list" endpoint once, so each module doesn't hand-write it. The flow is `readInput(surface: 'list')`, then validation against the query schema, then the module's query, then `successResponse`, with failures routed through `catchAs`. It is a sibling of `createSearchController`. The two are kept separate because a search reads the body first, which lets one controller serve both `GET /x` and `POST /x/search`. A list has no body to read.

## Key elements
- **`ListControllerSpec<TSchema, TResult>`**: the per-entity configuration:
  - `entity`: plural, camel-cased name such as `'inventoryLevels'`. It is used to derive the operation name.
  - `schema`: the generated query schema, relaxed for query strings. The doc says to add `page`/`pageSize` from `@infrastructure/http/schemas`, then call `.partial()`, so that absent values stay absent for `normalizePagination` to default.
  - `input?`: a `RequestInputDeclaration` for fields a query string can't type. It omits `surface`, which is fixed to `'list'`.
  - `runList(parsed, request)`: the module's own query, given the validated input. It returns the bare payload, not a pre-wrapped response.
- **`createListController(spec)`**: returns the express handler. It computes `operation = operationName('get', entity)`, for example `getInventoryLevels`, and wraps the handler with `namedHandler(operation, ...)`.

## Relationships
- Uses `readInput` and `RequestInputDeclaration` from `src/infrastructure/http/request.ts` to merge the query string into one input object.
- Uses `operationName`, `namedHandler`, `parseBody` and `catchAs` from `src/infrastructure/http/controller.ts`:
  - `parseBody` validates the input and sends a 422 on failure.
  - `catchAs` logs the error under the operation name and then returns a 500.
- Uses `successResponse` from `src/infrastructure/http/response.ts` to send the result as the response body.
- The `get-*` controllers in the listed modules (api-keys, audit-logs, delivery, inventory, observability, returns, webhooks) are the consumers. Each supplies an `entity`, a `schema` and a `runList`.

## Notes
- If validation fails, `parseBody` has already answered the request, so the handler returns `Promise.resolve()` and does not call `runList`.
- `runList` must return the bare payload. `successResponse` sends it as is, so a service that wraps its own result would wrap it twice.
- The operation name is shared by the log line, stack traces and the generated tables in `docs/modules/`. Changing `entity` therefore renames all of these.
