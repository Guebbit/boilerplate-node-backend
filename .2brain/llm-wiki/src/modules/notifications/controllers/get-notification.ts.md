---
source: src/modules/notifications/controllers/get-notification.ts
sha256: 60095a09dc129ec59b5a37c2f8a7819526651b42a3242472857347fdbb277ad2
generated_at: 2026-10-29T04:27:47.855005+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/controllers/get-notification.ts

## Purpose

Thin HTTP adapter for the `GET /notifications/:id` route. It extracts and validates the route parameter, delegates to `notificationsService.get`, and translates the service result into an appropriate Express response (200, 404, or error).

## Key elements

- **`getNotification`** (exported) — Express handler. Extracts `id` via `requireId`, calls `notificationsService.get(request.caller!, id)`, then either:
  - returns a 404 via `refused` if the service reports the notification is not found / not owned, or
  - sends the `Notification` payload as a 200 via `successResponse`.
  - Catches downstream errors through `catchAs(response, 'getNotificationById')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — provides `refused` (service-level 404 shortcut) and `catchAs` (unified error formatting).
- **`src/infrastructure/http/ids.ts`** — provides `requireId` to pull and validate the `:id` route parameter, writing a 404 response and returning `undefined` if absent.
- **`src/infrastructure/http/response.ts`** — provides `successResponse` for serializing the 200 body.
- **`src/modules/notifications/services/index.ts`** — supplies `notificationsService.get`, which performs the actual lookup and ownership check.
- **`src/modules/notifications/routes.ts`** — upstream caller that wires this handler to the `GET /notifications/:id` route.
- **`src/types/index.ts`** — defines the `Notification` type used as the response payload.

## Notes

- **Ownership = 404.** A notification belonging to another caller is indistinguishable from a non-existent one (both yield 404) to avoid leaking existence.
- **`request.caller!`** uses a non-null assertion; the caller's identity is expected to be attached by upstream auth middleware. If it is missing, the call will throw rather than return a clean 401/403.
- **Promise-chain style.** The handler uses `.then`/`.catch` rather than `async/await`, consistent with the `catchAs` helper's signature.
