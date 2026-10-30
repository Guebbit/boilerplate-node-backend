---
source: src/modules/notifications/controllers/post-read-all.ts
sha256: d4e2cef195219ce10874cc22cbca8310f1250b79334c58c8196f18b91042b044
generated_at: 2026-10-29T04:28:10.304276+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/controllers/post-read-all.ts

## Purpose

Thin HTTP adapter for `POST /notifications/read-all`. Receives the request, delegates to `notificationsService.readAll` with the authenticated user's ID, and returns a `204 No Content` on success. Exists to keep route wiring and service logic separate.

## Key elements

- **`postReadAll(request, response)`** — the sole export. Extracts `request.authContext!.id`, calls `notificationsService.readAll(id)`, sends `noContentResponse` on resolution, and funnels any rejection through `catchAs(response, 'readAllNotifications')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — provides `catchAs`, the shared error-catch helper that converts a rejected promise into an HTTP error response and logs under the `'readAllNotifications'` label.
- **`src/infrastructure/http/response.ts`** — provides `noContentResponse`, the helper that sends a bare `204` with no body.
- **`src/modules/notifications/routes.ts`** — imports `postReadAll` and attaches it to the `POST /notifications/read-all` route (upstream consumer).
- **`src/modules/notifications/services/index.ts`** — exports the `notificationsService` singleton whose `readAll(userId)` method performs the actual mark-as-read work.

## Notes

- `request.authContext!` is accessed with a non-null assertion; the controller assumes an upstream middleware has already populated it. If auth is missing, the call throws before the service is reached.
- The service call returns a promise (`.then/.catch`), so the controller does **not** use `async/await`. Follow this pattern when adding sibling controllers in the module.
- The `catchAs` label `'readAllNotifications'` is the identifier used in structured logging/correlation; keep it stable if you rename the route.
