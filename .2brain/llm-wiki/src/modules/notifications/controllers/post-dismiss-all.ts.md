---
source: src/modules/notifications/controllers/post-dismiss-all.ts
sha256: 7a3d3b9d88b1ecf5182024ed102729b8db951c30f73dc3f91a5c4dae4b6f4352
generated_at: 2026-10-15T10:49:55.000927+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/controllers/post-dismiss-all.ts

## Purpose

Thin Express controller for `POST /notifications/dismiss-all`. It extracts the caller's ID from the auth context, delegates to `notificationsService.notificationsDismissAll`, and maps the result (or error) onto the HTTP response.

## Key elements

- **`postDismissAll(request, response)`** — The sole export. Calls `notificationsService.notificationsDismissAll(request.authContext!.id)`, sends `result.data` / `result.message` via `successResponse` (HTTP 200), and routes any rejection through `catchAs(response, 'dismissAllNotifications')`.

## Relationships

- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, which formats and sends the success payload.
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs`, a shared error-capture helper that writes the error onto the response and logs under the given label.
- **`src/modules/notifications/services/index.ts`** — Exports `notificationsService`; the `notificationsDismissAll` method is the actual business logic this controller wraps.
- **`src/modules/notifications/routes.ts`** — Registers `postDismissAll` on the `/notifications/dismiss-all` route (expected, based on module convention).

## Notes

- Relies on `request.authContext` with a **non-null assertion** (`!`), so the route must be placed behind an authentication middleware that populates this field.
- Uses a `.then()/.catch()` chain rather than `async/await`; consistent with the surrounding controller pattern.
- Returns **200** (not 204) even though the operation is a bulk delete — the service may return metadata in `result.data`/`result.message`.
