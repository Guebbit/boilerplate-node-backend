---
source: src/modules/notifications/controllers/get-notification.ts
sha256: 60095a09dc129ec59b5a37c2f8a7819526651b42a3242472857347fdbb277ad2
generated_at: 2026-11-08T06:30:38.706951+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/controllers/get-notification.ts

## Purpose

Thin HTTP adapter for the `GET /notifications/:id` endpoint. It extracts the notification ID from the route param, delegates to `notificationsService.get`, and shapes the Express response. The controller contains no business logic beyond param validation and response formatting.

## Key elements

- **`getNotification`** (exported) — Express route handler. Reads `:id` via `requireId`, calls `notificationsService.get(request.caller!, id)`, then either sends a 200 with the `Notification` payload or lets the service's refusal/error path set the appropriate status.

## Relationships

- **`src/infrastructure/http/ids.ts`** — `requireId` validates and extracts the `id` route param; returns early (404) if missing.
- **`src/infrastructure/http/response.ts`** — `successResponse` wraps the 200 JSON reply with the `Notification` body.
- **`src/infrastructure/http/controller.ts`** — `refused` inspects the service result for a "not yours / not found" signal; `catchAs` is the error fallback attached to the promise chain.
- **`src/modules/notifications/services/index.ts`** — provides `notificationsService.get(caller, id)`, the actual data-access call.
- **`src/modules/notifications/routes.ts`** — registers `getNotification` as the handler for `GET /notifications/:id`.
- **`src/types/index.ts`** — supplies the `Notification` type used as the generic parameter on `successResponse`.

## Notes

- A notification ID that belongs to *another* caller is indistinguishable from a non-existent one: both produce the same 404 (`notifications.not-found`). This is intentional to avoid leaking existence.
- `request.caller!` uses a non-null assertion, implying an upstream auth middleware guarantees the field is populated before this handler runs.
- The service is called with `.then`/`.catch` (promise style) rather than `await`; `catchAs` is bound to the context string `'getNotificationById'` for error logging.
