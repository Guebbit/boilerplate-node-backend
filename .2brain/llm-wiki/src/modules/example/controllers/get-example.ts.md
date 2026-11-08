---
source: src/modules/example/controllers/get-example.ts
sha256: bcdab8f704d54d90b87124d2f2b5d2700a7ee28351bf99448d5ae5a7b00a43fc
generated_at: 2026-11-08T05:48:31.767290+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/controllers/get-example.ts

## Purpose

Defines the `GET /examples/:id` handler by delegating to the shared item-controller factory. It exists so that reading a single published example is a one-liner with consistent 404 semantics, and because this route sits **above** the auth gate (any visitor may read a published example).

## Key elements

- **`getExample`** (exported const) – The route handler for `GET /examples/:id`. Built via `createItemController` with:
  - `entity: 'example'` – routes i18n / logging to the example namespace.
  - `notFoundKey: 'example.not-found'` – the i18n key returned when no row matches.
  - `fetch(id, request)` – calls `exampleService.getById(id, callerContextOf(request))`, passing the extracted caller context so the service can apply ownership vs. `display:Example` visibility rules.

## Relationships

- **`src/infrastructure/surfaces/create-item-controller.ts`** – provides `createItemController`, the factory that owns the 404 response shape and the id-extraction/validation step. This file is a *consumer* of that factory.
- **`src/infrastructure/http/request.ts`** – provides `callerContextOf(request)`, used to derive the caller's identity/context and forward it to the service layer.
- **`src/modules/example/services/index.ts`** – provides `exampleService.getById`, the actual data-access call. The controller passes the caller context through; the service decides what is visible.
- **`src/modules/example/routes.ts`** – imports `getExample` and registers it on the `GET /examples/:id` path (this file is the route's handler binding).

## Notes

- **Above the auth gate:** Unlike most controllers in this codebase, this one is deliberately reachable without authentication. The visibility check (owner's own example vs. any with `display:Example`) happens inside the service, not here.
- **404 uniformity:** A non-existent id and a malformed id both return the same `example.not-found` response; that behaviour is owned by `createItemController`, not by this file.
- **No local logic:** There is no middleware, validation, or transformation in this file beyond the factory call. Any changes to response shape or error codes should be made in the factory or the service, not here.
