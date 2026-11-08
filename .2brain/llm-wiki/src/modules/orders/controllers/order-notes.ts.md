---
source: src/modules/orders/controllers/order-notes.ts
sha256: c29dcc2111a13d40cac2e9fb1d782d6c125017f273cd1c8a9040719f2d2f9119
generated_at: 2026-11-08T06:46:41.948510+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/order-notes.ts

## Purpose

Thin HTTP controller layer for staff notes on an order. It maps `POST /orders/:id/timeline/notes` (create a note) and `DELETE /orders/:id/timeline/notes/:eventId` (withdraw a note's text) onto `orderService`, handling only request parsing, ID validation, and response shaping. Authorization (`requirePermission('update', 'Order')`) is enforced upstream by the route, not here.

## Key elements

- **`postOrderNote`** — Validates the order `id` and Zod-parses the body against `AddOrderNoteBody`. Calls `orderService.addNote(id, text, callerContext)`. On success returns **201** with the `OrderTimelineEntry` body and a `Location` header pointing to the corresponding DELETE URL.
- **`deleteOrderNote`** — Validates both `id` and `eventId`. Calls `orderService.deleteNote(id, eventId, callerContext)`. On success returns **204 No Content**. The underlying row is *not* removed—only the note text is cleared.

## Relationships

- **`src/modules/orders/services/index.ts`** — Imports `orderService`; delegates all business logic (`addNote`, `deleteNote`) to it.
- **`src/modules/orders/routes.ts`** — Registers `postOrderNote` / `deleteOrderNote` as route handlers and applies the permission guard before they execute.
- **`src/infrastructure/http/controller.ts`** — Provides the shared helpers `catchAs`, `parseBody`, and `refused` used for error handling, body validation, and result short-circuiting.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf` to extract the authenticated caller's context and pass it into the service call.
- **`src/infrastructure/http/ids.ts`** — Provides `requireId` for extracting and validating route params (`id`, `eventId`) with a 404 response on failure.
- **`src/infrastructure/http/response.ts`** — Provides `createdResponse` (201 + `Location`) and `noContentResponse` (204).
- **`src/types/index.ts`** — Imports `CreateOrderNoteRequest` and `OrderTimelineEntry` as the typed request/response shapes.

## Notes

- The DELETE is a *soft* withdraw: the timeline entry row persists; only its `text` is unset. Clients should not expect a 404 on subsequent reads.
- The `Location` header on the POST response uses the entry's **own** `id` (from `result.data.id`), not the route-param `id`—the two are different identifiers.
- Both handlers follow the `refused → return` pattern: if the service returns a refusal result, the controller sends the appropriate error response and exits without further processing.
