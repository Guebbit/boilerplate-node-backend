---
source: src/modules/notifications/controllers/delete-notification.ts
source_sha256: eed4f753bd9d3eb6672d7d1b975e42d8e3f591595485e51fb555dd48988986b6
context_sha256: 51c3238eede06730ac145b82e8b5e24095be1e126a34647b3305bda3a29a8ce4
generated_at: 2026-11-22T05:52:43.746388+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/controllers/delete-notification.ts

## Purpose
Express controller for `DELETE /notifications/:id`. It is a thin HTTP adapter over `notificationsService.remove`, letting a caller delete one of their own notifications. An id belonging to another user gets the same 404 as one that does not exist.

## Key elements
- `deleteNotification(request, response)` — the exported handler.
  1. Validates the `:id` param with `requireId`, using the `notifications.not-found` error key. If the id is invalid, `requireId` has already responded and the handler returns.
  2. Calls `notificationsService.remove(request.authContext!.id, id)`, passing the authenticated caller's id and the notification id.
  3. If `refused(response, result)` handles the result, it stops there. Otherwise it sends `noContentResponse(response)`.
  4. Rejections are handled by `.catch(catchAs(response, 'deleteNotificationById'))`.

## Relationships
- `@infrastructure/http/ids` (`src/infrastructure/http/ids.ts`) — provides `requireId`, which parses and validates the route id.
- `@infrastructure/http/response` (`src/infrastructure/http/response.ts`) — provides `noContentResponse`, which sends the success reply.
- `@infrastructure/http/controller` (`src/infrastructure/http/controller.ts`) — provides `refused`, which turns service refusal results into HTTP error responses, and `catchAs`, which is the error handler for unexpected failures.
- `../services` (`src/modules/notifications/services/index.ts`) — provides `notificationsService`, which does the actual deletion and the ownership check.
- `src/modules/notifications/routes.ts` — wires this handler to the route.

## Notes
- The handler assumes auth middleware has already set `request.authContext`, and reads it with a non-null assertion (`!`).
- The not-found/ownership behavior is delivered through the service's result and `refused`. The controller itself does no ownership check.
- The `'deleteNotificationById'` label passed to `catchAs` differs from the exported name `deleteNotification`.
