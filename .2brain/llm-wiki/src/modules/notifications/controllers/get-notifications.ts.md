---
source: src/modules/notifications/controllers/get-notifications.ts
sha256: 0a4494dffff378b7b21c445192087a6f2e367421ac6877611ab69b2d93f6a1be
generated_at: 2026-10-15T10:49:47.974041+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/controllers/get-notifications.ts

## Purpose

Thin HTTP adapter that handles the `GET /notifications` endpoint. It extracts the authenticated user's ID from the request, delegates to the notifications service, and maps the result into a standard success response (or a standard error response on failure).

## Key elements

- **`getNotifications(request, response)`** — The sole export. Reads `request.authContext!.id`, calls `notificationsService.notificationsList(userId)`, and writes the view through `successResponse`. Errors are routed to `catchAs(response, 'listNotifications')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Provides `catchAs`, the shared error-handling wrapper used in the `.catch()` branch.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, the shared helper that serializes a view into the standard JSON envelope.
- **`src/modules/notifications/routes.ts`** — Registers `getNotifications` as the handler for the `GET /notifications` route.
- **`src/modules/notifications/services/index.ts`** — Exports `notificationsService`; this controller calls its `notificationsList(id)` method to fetch the user's inbox.
- **`src/types/index.ts`** — Supplies the `NotificationsResponse` type used as the generic parameter on `successResponse`.

## Notes

- `request.authContext` is accessed with a non-null assertion (`!`), meaning the route is expected to be behind an authentication middleware that always sets it. A missing `authContext` would throw at runtime rather than producing a 401 here.
- The controller contains no business logic; all list-building, ordering ("newest first"), and permission checks live in `notificationsService.notificationsList`.
