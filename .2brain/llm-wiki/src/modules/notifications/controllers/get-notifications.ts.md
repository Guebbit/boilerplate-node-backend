---
source: src/modules/notifications/controllers/get-notifications.ts
source_sha256: a065b100a0a125384af2b2643dc9d1d3e6cd9dc87930d2c77b461d61fca5c819
context_sha256: 177a276211fcb140fd57eaba8e6bb6281ede1e856d8177671a4dad88013123fa
generated_at: 2026-11-22T05:53:17.722285+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/controllers/get-notifications.ts

## Purpose
Controller for `GET /notifications`. It is a thin HTTP adapter that returns the authenticated user's own inbox plus the work notices they hold the sets for, newest first. All logic lives in the notifications service.

## Key elements
- `getNotifications(request, response)`: the only export. It calls `notificationsService.listVisible(request.caller!)`. On success it sends the result with `successResponse<NotificationsResponse>(response, view)`. On failure it passes the error to `catchAs(response, 'listNotifications')`.

## Relationships
- `src/modules/notifications/services/index.ts`: provides `notificationsService`, whose `listVisible` does the work.
- `src/infrastructure/http/response.ts`: provides `successResponse`, which formats the success reply.
- `src/infrastructure/http/controller.ts`: provides `catchAs`, which handles errors under the label `'listNotifications'`.
- `src/types/index.ts`: provides the `NotificationsResponse` type (imported as `@types`), used as the response payload type.
- `src/modules/notifications/routes.ts`: the route file that wires this controller to `GET /notifications`.

## Notes
- `request.caller!` is a non-null assertion. The handler assumes upstream authentication middleware has already set `caller`, and it does no check of its own.
- The doc comment and the module header describe the service call as `list`, but the code calls `listVisible`.
- The handler returns the promise chain and does not use `async`/`await`.
