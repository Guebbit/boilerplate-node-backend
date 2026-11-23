---
source: src/modules/orders/controllers/order-notes.ts
source_sha256: c29dcc2111a13d40cac2e9fb1d782d6c125017f273cd1c8a9040719f2d2f9119
context_sha256: afb46659fec54b15f62d291759b4dad2f6839cd2cfeb7c66724f569812dcddb9
generated_at: 2026-11-22T06:09:15.745214+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/controllers/order-notes.ts

## Purpose
Express controllers for staff notes on an order. `POST /orders/:id/timeline/notes` creates a note, and `DELETE /orders/:id/timeline/notes/:eventId` withdraws its text. The handlers only wire HTTP requests to `orderService`. The route's `requirePermission('update', 'Order')` check has already run before they are called.

## Key elements
- `postOrderNote(request, response)`:
  - Validates the `id` path param with `requireId`, using the `orders.not-found` error.
  - Parses the body with `parseBody(AddOrderNoteBody, ...)`.
  - Calls `orderService.addNote(id, body.text, callerContextOf(request))`.
  - Replies 201 through `createdResponse<OrderTimelineEntry>`, passing the created entry and a `Location` of `/orders/${id}/timeline/notes/${entry.id}`, which is the URL of the matching DELETE.
- `deleteOrderNote(request, response)`:
  - Validates both `id` and `eventId` (via `requireId` with `name: 'eventId'`), each with `orders.not-found`.
  - Calls `orderService.deleteNote(id, eventId, callerContextOf(request))`.
  - Replies 204 through `noContentResponse`.
  - The delete unsets the note's text, and the timeline row stays.

Both handlers return `Promise<void>`.

## Relationships
- `src/modules/orders/services/index.ts`: provides `orderService`, whose `addNote` and `deleteNote` hold the logic.
- `src/infrastructure/http/request.ts`: `callerContextOf` builds the caller context passed to the service.
- `src/infrastructure/http/ids.ts`: `requireId` validates and extracts path IDs.
- `src/infrastructure/http/response.ts`: `createdResponse` and `noContentResponse` send the success responses.
- `src/infrastructure/http/controller.ts`: `parseBody`, `refused` and `catchAs` handle body validation, service refusals and error handling.
- `src/types/index.ts`: supplies the `CreateOrderNoteRequest` and `OrderTimelineEntry` types.
- `src/modules/orders/routes.ts`: mounts these handlers on the routes above, with the permission middleware in front.

## Notes
- Every guard follows one pattern. A helper that fails sends the error response itself and returns a falsy value, and the handler then returns `Promise.resolve()`. `refused(response, result)` does the same for service results, so the service returns a result object and does not throw to signal refusal.
- Unexpected rejections are handled by `catchAs(response, '<handlerName>')`.
