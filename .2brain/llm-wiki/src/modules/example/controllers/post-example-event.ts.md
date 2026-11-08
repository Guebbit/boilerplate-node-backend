---
source: src/modules/example/controllers/post-example-event.ts
sha256: a218cccc0b9e99fc33e82cb2fc303f6e53e11b547adedfc287c03455cd38a422
generated_at: 2026-11-08T05:48:53.580271+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/controllers/post-example-event.ts

## Purpose

Thin action controller for the three lifecycle endpoints of the `example` resource (`POST /examples/:id/publish`, `/archive`, `/unarchive`). Each handler validates the route `:id`, delegates to the corresponding `exampleService` method, and shapes the HTTP response. All business rules live in the service layer; this file exists only to wire the HTTP contract to those calls.

## Key elements

- **`EventDoor`** (type) — Signature every service function behind a door must satisfy: `(id, context) => …`. Pins the contract so the factory can accept any of the three service methods.
- **`eventHandler(operation, door)`** (internal factory) — Returns a named Express handler that:
  1. Extracts and validates `:id` via `requireId` (404 if missing).
  2. Calls `door(id, callerContextOf(request))`.
  3. Checks `refused` (service-level "not allowed" signal) before writing a 200 success.
  4. Catches rejections into a structured error response via `catchAs`.
- **`postExamplePublish`** — Exported handler for `POST /examples/:id/publish`.
- **`postExampleArchive`** — Exported handler for `POST /examples/:id/archive`.
- **`postExampleUnarchive`** — Exported handler for `POST /examples/:id/unarchive`.

## Relationships

- **`@infrastructure/http/controller`** — Supplies `namedHandler` (wraps a handler with its operation name for logs/metrics), `refused` (determines whether the service result is a rejection), and `catchAs` (maps thrown errors to an error response).
- **`@infrastructure/http/ids`** — Supplies `requireId` for extracting and validating the route parameter.
- **`@infrastructure/http/request`** — Supplies `callerContextOf` to derive the authenticated caller context from the Express request.
- **`@infrastructure/http/response`** — Supplies `successResponse` for the 200 reply.
- **`src/modules/example/services/index.ts`** — Source of `exampleService.publishById`, `.archiveById`, and `.unarchiveById`; the only business logic this file invokes.
- **`src/modules/example/routes.ts`** — Registers the three exported handlers on the module router.
- **`src/types/auth-context.ts`** — Provides the `CallerContext` type passed into every service call.

## Notes

- All three doors share identical validation and response logic; the *only* difference is the `operation` string (used in logs/metrics) and the service function. If you add a new lifecycle door, reuse `eventHandler` rather than duplicating the body.
- `requireId` writes a 404 response internally and returns `undefined`; the `if (!id) return` guard prevents the handler from continuing. Don't remove it.
- `refused(response, result)` must be checked *before* `successResponse` — the service signals "not allowed" through the result shape rather than by throwing. Swapping the order would mask rejections as 200s.
- The module docblock marks this file as deletable if a module has no action doors; it is effectively a template convention, not a special-case.
