---
source: src/modules/example/controllers/post-example-event.ts
sha256: a218cccc0b9e99fc33e82cb2fc303f6e53e11b547adedfc287c03455cd38a422
generated_at: 2026-10-29T03:51:41.463749+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/controllers/post-example-event.ts

## Purpose

Provides the three lifecycle action handlers (`publish`, `archive`, `unarchive`) for the example module. All three share identical HTTP plumbing (id validation, service call, success/refusal/error response), so a single `eventHandler` factory generates each one. The controllers are intentionally thin; the business rules live in the service layer.

## Key elements

- **`EventDoor`** (type) — Signature of the service function behind one door: `(id: string, context: CallerContext) => …`. The return type is anchored to `exampleService.publishById`, enforcing that all three service methods return the same shape.
- **`eventHandler`** (function, not exported) — Factory that, given an `operation` name and a `door` function, returns an Express handler. It: validates the route param via `requireId`, invokes `door(id, callerContextOf(request))`, checks `refused` before sending a `successResponse(200)`, and delegates unexpected errors to `catchAs`.
- **`postExamplePublish`** (export) — Handler for `POST /examples/:id/publish`; delegates to `exampleService.publishById`.
- **`postExampleArchive`** (export) — Handler for `POST /examples/:id/archive`; delegates to `exampleService.archiveById`.
- **`postExampleUnarchive`** (export) — Handler for `POST /examples/:id/unarchive`; delegates to `exampleService.unarchiveById`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/example/services/index.ts` | Imports `exampleService` and calls its `publishById`, `archiveById`, `unarchiveById` methods. |
| `src/infrastructure/http/controller.ts` | Imports `namedHandler`, `refused`, `catchAs` for handler naming, refusal short-circuit, and error translation. |
| `src/infrastructure/http/ids.ts` | Imports `requireId` to validate the `:id` route parameter. |
| `src/infrastructure/http/request.ts` | Imports `callerContextOf` to extract the authenticated caller from the request. |
| `src/infrastructure/http/response.ts` | Imports `successResponse` to write the 200 JSON body. |
| `src/modules/example/routes.ts` | Consumes the three exported handlers and wires them to their respective `POST` routes. |
| `src/types/auth-context.ts` / `src/types/index.ts` | Supplies the `CallerContext` type used by the `EventDoor` signature. |

## Notes

- **All three handlers are structurally identical.** The only differences are the `operation` string (used in logs/metrics) and the service function passed to the factory. If you add a fourth lifecycle door, add one more `eventHandler(…)` call — do not duplicate the HTTP logic.
- **`refused` short-circuits before `successResponse`.** If the service signals a refusal (e.g., permission denied, wrong state), the handler returns early; the client never sees the `200` path.
- **Not-found code is `'example.not-found'`.** This string is passed to `requireId` and will surface in the 404 body; keep it consistent with other example-module endpoints.
- **Delete this file** if the example module no longer has action doors (per the module doc comment).
