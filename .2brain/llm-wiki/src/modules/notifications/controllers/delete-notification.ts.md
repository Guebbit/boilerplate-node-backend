---
source: src/modules/notifications/controllers/delete-notification.ts
sha256: eed4f753bd9d3eb6672d7d1b975e42d8e3f591595485e51fb555dd48988986b6
generated_at: 2026-10-29T04:27:32.178021+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/controllers/delete-notification.ts

## Purpose

Thin HTTP adapter that handles the `DELETE /notifications/:id` endpoint. It extracts and validates the route parameter, delegates to `notificationsService.remove`, and maps the result to an appropriate HTTP response (204 or error). It exists so the route layer stays declarative while all request/response mechanics live here.

## Key elements

- **`deleteNotification`** (exported function) — The sole export. Accepts Express `Request<{ id: string }>` and `Response`. Steps:
  1. `requireId` pulls and validates `:id` from the request; on failure it sends a 404 with key `'notifications.not-found'` and returns early.
  2. Calls `notificationsService.remove(request.authContext!.id, id)`.
  3. On success, checks `refused` (handles denial/rejection signals); otherwise sends `noContentResponse` (204).
  4. Any thrown/rejected error is forwarded to `catchAs(response, 'deleteNotificationById')`.

## Relationships

- **`src/infrastructure/http/ids.ts`** — `requireId` validates the `:id` path param and short-circuits with a 404 when missing.
- **`src/infrastructure/http/response.ts`** — `noContentResponse` produces the 204 reply on successful deletion.
- **`src/infrastructure/http/controller.ts`** — `refused` inspects the service result for a rejection signal; `catchAs` converts unhandled errors into a structured HTTP error response tagged with the operation name.
- **`src/modules/notifications/services/index.ts`** — `notificationsService.remove(userId, notificationId)` performs the actual deletion and ownership check.
- **`src/modules/notifications/routes.ts`** — Registers `deleteNotification` as the handler for `DELETE /notifications/:id`.

## Notes

- Ownership is enforced *inside* the service, not in this controller: an id belonging to another user yields the same 404 as a nonexistent id (deliberate enumeration protection).
- `request.authContext!` uses a non-null assertion; the route is assumed to be behind an auth guard that populates it.
- The controller is synchronous-in-signature (no `async`); the Promise chain is returned directly from `notificationsService.remove`.
