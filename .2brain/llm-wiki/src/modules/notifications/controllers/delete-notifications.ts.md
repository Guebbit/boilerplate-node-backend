---
source: src/modules/notifications/controllers/delete-notifications.ts
sha256: 29b924f0cafc39f9870054f8c3ab79f101db916da02838977d53ea9702ce5ef9
generated_at: 2026-10-29T04:27:38.905884+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/controllers/delete-notifications.ts

## Purpose

Thin HTTP adapter that exposes the `DELETE /notifications` endpoint. It delegates the actual work to `notificationsService.dismissAll` and translates the result into a `204 No Content` response.

## Key elements

- **`deleteNotifications(request, response)`** — Express handler for `DELETE /notifications`. Reads the caller's user ID from `request.authContext`, calls `notificationsService.dismissAll(id)`, responds with `noContentResponse` on success, and routes failures through `catchAs(response, 'dismissAllNotifications')`.

## Relationships

- **`src/modules/notifications/routes.ts`** — registers `deleteNotifications` as the handler for the `DELETE /notifications` route.
- **`src/modules/notifications/services/index.ts`** — source of `notificationsService`, whose `dismissAll` method performs the actual data deletion.
- **`src/infrastructure/http/response.ts`** — provides `noContentResponse`, the shared helper that writes a `204` with no body.
- **`src/infrastructure/http/controller.ts`** — provides `catchAs`, the shared error-catch wrapper that serialises thrown errors into an HTTP error response.

## Notes

- Uses a non-null assertion (`request.authContext!.id`); it assumes an upstream auth middleware has already populated `authContext`. No guard is present in this file.
- The `catchAs` tag string is `'dismissAllNotifications'`, which is longer than the service method name (`dismissAll`). Search for the service by method name, but search for the error tag by this longer string.
- Returns a Promise chain (`.then` / `.catch`) rather than using `async/await`; the route layer must handle the returned Promise (or Express 5 will do so implicitly).
