---
source: src/modules/notifications/controllers/post-read-all.ts
source_sha256: d4e2cef195219ce10874cc22cbca8310f1250b79334c58c8196f18b91042b044
context_sha256: 42cab71af3da031a017e6dd8346a2adcc38a761b54505a6370a4d8adc1c03f4e
generated_at: 2026-11-22T05:53:22.274067+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/controllers/post-read-all.ts

## Purpose
Express controller for `POST /notifications/read-all`. It is a thin HTTP adapter that marks every unread notification of the authenticated caller as read by delegating to `notificationsService.readAll`.

## Key elements
- `postReadAll(request, response)` — the only export. It calls `notificationsService.readAll(request.authContext!.id)`. On success it sends a no-content response via `noContentResponse(response)`. On failure it routes the error through `catchAs(response, 'readAllNotifications')`.

## Relationships
- `src/modules/notifications/services/index.ts` — supplies `notificationsService`, which holds the actual read-all logic.
- `src/infrastructure/http/response.ts` — supplies `noContentResponse`, used for the success reply.
- `src/infrastructure/http/controller.ts` — supplies `catchAs`, which builds the error handler. The string `'readAllNotifications'` is passed as its second argument.
- `src/modules/notifications/routes.ts` — the neighbor that wires this handler to the `POST /notifications/read-all` route.

## Notes
- It reads `request.authContext!.id` with a non-null assertion. It assumes authentication middleware has already populated `authContext`, and the controller does no check of its own.
- The handler returns the promise chain rather than being `async`. Errors are handled by `.catch`, not by a try/catch.
- The success response has no body (204-style, per the `noContentResponse` name).
