---
source: src/modules/notifications/controllers/get-notifications.ts
sha256: a065b100a0a125384af2b2643dc9d1d3e6cd9dc87930d2c77b461d61fca5c819
generated_at: 2026-10-29T04:28:03.229167+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/controllers/get-notifications.ts

## Purpose

Thin HTTP adapter for the `GET /notifications` endpoint. It extracts the authenticated caller from the request, delegates to `notificationsService.listVisible`, and writes the result (or an error) back to the client. Contains no business logic itself.

## Key elements

- **`getNotifications`** (exported) — Express handler for `GET /notifications`. Calls `notificationsService.listVisible(request.caller!)`, then either sends a `successResponse<NotificationsResponse>` or routes the rejection through `catchAs(response, 'listNotifications')`.

## Relationships

- **`src/modules/notifications/routes.ts`** — Registers `getNotifications` as the handler for the `GET /notifications` route.
- **`src/modules/notifications/services/index.ts`** — Source of `notificationsService`, whose `listVisible` method performs the actual data retrieval (the user's inbox plus work notices for sets they hold, newest first).
- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, the shared envelope for 200 responses.
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs`, the shared error-to-response mapper.
- **`src/types/index.ts`** — Defines the `NotificationsResponse` shape used as the generic parameter of `successResponse`.

## Notes

- `request.caller!` uses a non-null assertion; an auth/middleware layer is expected to populate `caller` before this handler runs. If that assumption is broken, the service will receive `undefined`.
- The service method is named `listVisible` (not `list`), matching the JSDoc's "own inbox plus work notices they hold the sets for" scope.
