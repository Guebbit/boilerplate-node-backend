---
source: src/modules/notifications/controllers/get-notification.ts
generated_at: 2026-11-22T05:53:01.320481+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/controllers/get-notification.ts

## Purpose
HTTP controller for `GET /notifications/:id`. It is a thin adapter that validates the id, delegates to `notificationsService.get`, and turns the result into an HTTP response. It returns one of the caller's own notifications.

## Key elements
- `getNotification(request, response)`: the exported Express handler.
  - It calls `requireId` with a not-found key of `'notifications.not-found'`. If that fails, the handler returns without doing anything else, because `requireId` has already handled the response.
  - It calls `notificationsService.get(request.caller!, id)`.
  - If `refused(response, result)` reports a refusal, the handler returns. Otherwise it sends `successResponse<Notification>(response, result.data, 200)`.
  - Rejections go to `catchAs(response, 'getNotificationById')`.

## Relationships
- `src/infrastructure/http/ids.ts`: provides `requireId`, which validates the `:id` param and is given the `'notifications.not-found'` key for the not-found case.
- `src/infrastructure/http/controller.ts`: provides `refused`, which short-circuits when the service result is a refusal, and `catchAs`, the error handler for rejected promises. The `'getNotificationById'` label is passed to `catchAs`.
- `src/infrastructure/http/response.ts`: provides `successResponse` for the 200 payload.
- `src/modules/notifications/services/index.ts`: provides `notificationsService`, whose `get` method holds the actual logic.
- `src/types/index.ts`: provides the `Notification` type, used as the generic for `successResponse`.
- `src/modules/notifications/routes.ts`: the neighboring routes module, which is the expected place where this handler is mounted for `GET /notifications/:id`. The handler itself does not reference it.

## Notes
- The handler relies on `request.caller` being set by upstream middleware. It uses a non-null assertion (`!`) and does not check for it.
- Per the doc comment, an id that belongs to another user gets the same 404 as an id that does not exist. This is meant to avoid revealing which ids exist. The behavior is implemented in the service, not here.
- The handler contains no business logic.
