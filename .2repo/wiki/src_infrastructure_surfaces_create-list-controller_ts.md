# src/infrastructure/surfaces/create-list-controller.ts

## Purpose

Factory that builds a single Express handler for a paged-list endpoint. It encapsulates the fixed pipeline — read the query string as input, validate it against a Zod schema, delegate to a module-supplied `runList`, and return `successResponse` or a 500 — so each module only supplies what varies (entity name, schema, input shape, query logic). Kept separate from `createSearchController` because a list has no request body; merging them would add a `surface` knob to a factory whose whole purpose is "where input comes from."

## Key elements

- **`ListControllerSpec<TSchema>`** — per-entity configuration: `entity` (camelCase plural, e.g. `'inventoryLevels'`), `schema` (Zod query schema, typically `.partial()` so absent fields stay absent for `normalizePagination`), `input` (optional `RequestInputDeclaration` minus `surface`), and `runList` (the module's query, returning `{ data?: unknown }`).
- **`createListController<TSchema>(spec)`** — returns a named Express handler. The handler name is the computed key `get${Entity}` (e.g. `getInventoryLevels`), chosen so `handler.name`, stack traces, log lines, and `docs/modules/` tables all agree. Internally it calls `readInput(request, { …input, surface: 'list' })` → `parseBody(schema, …)` → `runList(parsed, request)` → `successResponse` / `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — imports `parseBody` (schema validation with 422 short-circuit) and `catchAs` (error → logged 500 under the operation name).
- **`src/infrastructure/http/request.ts`** — imports `readInput` (resolves the query string per the `list` surface rules) and the `RequestInputDeclaration` type used in the spec.
- **`src/infrastructure/http/response.ts`** — imports `successResponse` to serialize `result.data` back to the client.
- **`src/modules/inventory/controllers/get-inventory-levels.ts`** — consumes `createListController` with entity `'inventoryLevels'`, its query schema, and its `runList`.
- **`src/modules/inventory/controllers/get-stock-movements.ts`** — consumes `createListController` with entity `'stockMovements'`, its query schema, and its `runList`.

## Notes

- The schema should be `.partial()` at the point of declaration; the factory does **not** apply `.partial()` itself. Absent fields must remain absent so that downstream `normalizePagination` can own default values for `page`/`pageSize`.
- The handler is returned via a computed-property-key object literal (`{ [operation](…){…} }[operation]`) specifically so that `Function.name` reflects the operation rather than being an anonymous string.
- `runList` receives the full `Request` as its second argument, giving the module access to headers, cookies, etc., beyond the validated query object.
- On validation failure `parseBody` writes a 422 and returns `undefined`; the handler resolves immediately with no further work (no 500, no `catchAs`).
