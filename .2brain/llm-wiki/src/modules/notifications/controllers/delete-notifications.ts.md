---
source: src/modules/notifications/controllers/delete-notifications.ts
source_sha256: 5e8aae6bb753e8f27d6327382e806c3cd0d6bc73f6b7192a3028ac177fbfbf41
context_sha256: 42cab71af3da031a017e6dd8346a2adcc38a761b54505a6370a4d8adc1c03f4e
generated_at: 2026-11-22T05:52:49.136010+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/controllers/delete-notifications.ts

## Purpose
Express controller for `DELETE /notifications`. It is a thin HTTP adapter that deletes (dismisses) all of the caller's notifications, optionally limited to a single `audience`, by delegating to `notificationsService.dismissAll`.

## Key elements
- `deleteNotifications(request, response)` — the exported handler.
  - Validates `request.query` against `DismissAllNotificationsQueryParams` (from `@api/schemas.zod`) using `parseBody`. If validation fails, it returns without further work. The response for the failure is handled by `parseBody`, which receives `response`.
  - Calls `notificationsService.dismissAll(request.authContext!.id, parsed.audience)`.
  - On success, sends an empty response via `noContentResponse(response)`.
  - On error, `catchAs(response, 'dismissAllNotifications')` handles the failure.

## Relationships
- `src/infrastructure/http/controller.ts` — provides `parseBody` (query validation) and `catchAs` (error-to-response handling, labelled `'dismissAllNotifications'`).
- `src/infrastructure/http/response.ts` — provides `noContentResponse`, used for the success reply.
- `src/modules/notifications/services/index.ts` — exports `notificationsService`, whose `dismissAll` does the actual deletion.
- `src/modules/notifications/routes.ts` — the route layer that wires this handler to `DELETE /notifications`. The file itself doesn't show this wiring.

## Notes
- Despite the name `parseBody`, it is used here to validate the **query string**, not the body.
- The user id comes from `request.authContext!.id`. The non-null assertion assumes authentication middleware has already populated `authContext`.
- `audience` is optional by the file's description ("or only one `audience`"). Its exact type and allowed values are defined in the schema, not in this file.
