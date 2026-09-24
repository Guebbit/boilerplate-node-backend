---
source: src/infrastructure/surfaces/create-list-controller.ts
sha256: bb86ee9df2956b146696a2d517a91f62005cdbbcdd96e34adcb5b0c58b4a248f
generated_at: 2026-09-23T17:53:49.819553+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/surfaces/create-list-controller.ts

## Purpose

Factory that produces an Express handler for any paged-list endpoint. It encapsulates the single shared flow—read query-string input → validate against a Zod schema → invoke the module's query → wrap the result in the standard success envelope or a `catchAs` error—so each entity only supplies its differences (entity name, schema, and query function) rather than repeating the boilerplate.

## Key elements

- **`ListControllerSpec<TSchema, TResult>`** – Interface the caller fills in: `entity` (drives the operation name, e.g. `getInventoryLevels`), `schema` (Zod query schema, already `.partial()`-ed so absent fields stay absent), optional `input` (extra `readInput` declaration fields), and `runList` (the module's own query, returning a bare payload).
- **`createListController(spec)`** – The exported factory. Returns a `namedHandler` whose name is `get<Entity>`. Internally calls `readInput(request, {…input, surface: 'list'})`, validates via `parseBody`, short-circuits with 422 on failure, then chains `runList` → `successResponse` / `catchAs`.

## Relationships

- **`@infrastructure/http/controller`** – Imports `catchAs`, `namedHandler`, `operationName`, `parseBody`. All validation, naming, and error-handling primitives come from here.
- **`@infrastructure/http/request`** – Imports `readInput` and the `RequestInputDeclaration` type. `readInput` merges the query string into a single object under the `list` surface rules before validation.
- **`@infrastructure/http/response`** – Imports `successResponse` to build the wire envelope around `runList`'s bare payload.
- **Module controllers** (`list-api-keys`, `get-audit`, `get-inventory-levels`, `get-stock-movements`, `get-observability-udit`, `list-deliveries`, `list-subscriptions`) – Each is a consumer that calls `createListController` with its own spec to register its list route.

## Notes

- Intentionally kept separate from `createSearchController` (sibling module) because a search reads the request **body** first while a list has no body. Folding them would require a `surface` knob on a factory whose entire subject is *where* input comes from.
- The schema is expected to be pre-`.partial()`-ed; absent fields must remain `undefined` so `normalizePagination` (inside the module's `runList`) can apply its own defaults. A fully-required schema would make 422 fire on missing pagination params.
- `runList` must return the **bare payload**, not a wrapped response. `successResponse` builds the envelope once; a service that pre-wraps would double-wrap.
- The `operation` string (e.g. `getInventoryLevels`) is the single source of truth for the log line, the stack-trace name, and the table generated under `docs/modules/`.
