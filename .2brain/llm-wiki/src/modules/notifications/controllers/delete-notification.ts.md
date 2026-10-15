---
source: src/modules/notifications/controllers/delete-notification.ts
sha256: cf0e342154b283bb058f5c18597ea32e56f0d991b44a3226924f6fe2ed74f9ad
generated_at: 2026-10-15T10:49:31.088472+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/controllers/delete-notification.ts

## Purpose
Thin HTTP adapter that maps `DELETE /notifications/:id` to `notificationsService.notificationDelete`. It performs no business logic itself; it only extracts the id, delegates to the service, and shapes the HTTP response.

## Key elements
- **`deleteNotification`** (exported function) — Express handler accepting `(Request<{ id: string }>, Response)`. Reads the `:id` param via `requireId`, calls `notificationsService.notificationDelete(authContext.id, id)`, then either rejects via `refused`, succeeds via `successResponse`, or surfaces an error via `catchAs`.

## Relationships
- **`src/infrastructure/http/ids.ts`** — `requireId` extracts and validates the `id` route param; short-circuits with a 404 if missing.
- **`src/infrastructure/http/controller.ts`** — `refused` handles service-level rejection (e.g., "not owned by caller"); `catchAs` funnels unexpected errors into a standard 500 with a trace label (`'deleteNotificationById'`).
- **`src/infrastructure/http/response.ts`** — `successResponse` serializes the service result into the JSON body with the given status code and message.
- **`src/modules/notifications/services/index.ts`** — provides `notificationsService.notificationDelete`, the actual domain operation (ownership check + deletion).
- **`src/modules/notifications/routes.ts`** — registers `DELETE /:id` on the notifications router, binding it to this controller.

## Notes
- **Ownership masking:** A notification belonging to a different user returns the same 404 as a missing one, deliberately avoiding existence-leakage across users.
- **`request.authContext!`** uses a non-null assertion; correct behaviour assumes an upstream auth middleware has populated `authContext` before the router dispatches to this handler.
- The controller is intentionally stateless and side-effect-free beyond the single service call — all domain rules live in the service layer.
