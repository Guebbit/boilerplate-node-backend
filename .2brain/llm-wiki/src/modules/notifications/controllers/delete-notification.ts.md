---
source: src/modules/notifications/controllers/delete-notification.ts
sha256: eed4f753bd9d3eb6672d7d1b975e42d8e3f591595485e51fb555dd48988986b6
generated_at: 2026-11-08T06:30:23.178108+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/controllers/delete-notification.ts

## Purpose
Thin HTTP adapter for `DELETE /notifications/:id`. Validates the path parameter, delegates to `notificationsService.remove`, and maps the result to an appropriate HTTP response (204 on success, 404 / refused / error otherwise). Exists so the route layer can stay declarative while all transport concerns live here.

## Key elements
- **`deleteNotification(request, response)`** – Exported handler. Extracts `:id` via `requireId`, calls `notificationsService.remove(authId, id)`, then sends 204 (`noContentResponse`) on success. If the service signals a refusal, `refused()` handles the response and the function short-circuits.
- **`catchAs(response, 'deleteNotificationById')`** – Catch-all error handler applied to the promise chain; formats and sends an error response keyed by the operation name.

## Relationships
- **`src/infrastructure/http/controller.ts`** – Supplies `catchAs` (error formatting) and `refused` (graceful "not allowed" short-circuit).
- **`src/infrastructure/http/ids.ts`** – Supplies `requireId`, which reads the `:id` param, validates it, and responds with 404 (`notifications.not-found`) if missing or malformed.
- **`src/infrastructure/http/response.ts`** – Supplies `noContentResponse` for the 204 success path.
- **`src/modules/notifications/routes.ts`** – Registers this handler on the `DELETE /notifications/:id` route.
- **`src/modules/notifications/services/index.ts`** – Provides `notificationsService.remove(userId, notificationId)`; the controller is a pure transport layer over this call.

## Notes
- **Ownership is indistinguishable from absence.** A notification that exists but belongs to another user returns the same 404 as a nonexistent one, preventing enumeration.
- **`request.authContext!.id`** uses a non-null assertion — the controller assumes an upstream auth middleware has already populated it; there is no guard in this file.
- **`refused` pattern:** the service can return a result that is not a plain success/failure. When `refused()` returns true it has already written the response; the `if (!id) return` and `if (refused(...)) return` early-exits exist to prevent a second response.
- The handler returns the promise from `.catch(...)` rather than using `async/await`, consistent with the codebase's controller style.
