---
source: src/modules/example/controllers/get-example.ts
sha256: bcdab8f704d54d90b87124d2f2b5d2700a7ee28351bf99448d5ae5a7b00a43fc
generated_at: 2026-10-29T03:51:20.889193+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/controllers/get-example.ts

## Purpose

Read-one controller for `GET /examples/:id`. It delegates entirely to the shared item-controller factory so that 404 semantics (unknown or malformed ID → same response) live in one place. Published examples sit above the auth gate and are readable by anyone.

## Key elements

- **`getExample`** (exported) — the handler mounted at `GET /examples/:id`. Built by `createItemController` with:
  - `entity: 'example'`
  - `notFoundKey: 'example.not-found'` (error/i18n key the factory uses for 404)
  - `fetch: (id, request) → exampleService.getById(id, callerContextOf(request))` — resolves the row via the module service, passing the caller context extracted from the request.

## Relationships

- **`src/infrastructure/surfaces/create-item-controller.ts`** — provides the `createItemController` factory that wraps the fetch callback with standard HTTP response shape and 404 handling.
- **`src/infrastructure/http/request.ts`** — source of `callerContextOf`, used to pull the authenticated caller's identity from the raw request and forward it to the service.
- **`src/modules/example/services/index.ts`** — exports `exampleService`; the actual `getById` lookup is delegated here.
- **`src/modules/example/routes.ts`** — mounts `getExample` as the handler for the `GET /examples/:id` route.

## Notes

- This file contains no error-handling logic of its own; the factory owns the 404 path. A malformed `:id` and a genuinely missing ID produce the identical response.
- The header comment cross-references `docs/theory/request-flow.md` for the broader request-lifecycle contract.
