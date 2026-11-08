---
source: src/modules/notifications/controllers/get-notifications.ts
sha256: a065b100a0a125384af2b2643dc9d1d3e6cd9dc87930d2c77b461d61fca5c819
generated_at: 2026-11-08T06:30:54.925450+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/controllers/get-notifications.ts

## Purpose

A thin HTTP adapter that exposes `GET /notifications`. It extracts the authenticated caller from the request, delegates to `notificationsService.listVisible`, and serialises the result (or an error) back to the client. Exists so the route layer stays one-liner and all HTTP concerns are isolated here.

## Key elements

- **`getNotifications(request, response)`** — the sole export. Calls `notificationsService.listVisible(request.caller!)`, then either sends a `successResponse<NotificationsResponse>` with the returned view or funnels the rejection through `catchAs(response, 'listNotifications')`.

## Relationships

- **`src/infrastructure/http/response.ts`** — provides `successResponse`, the standardised JSON success envelope used to send the notifications payload.
- **`src/infrastructure/http/controller.ts`** — provides `catchAs`, which wraps the `.catch` handler so errors are formatted into a consistent HTTP error response with a stable operation label (`'listNotifications'`).
- **`src/modules/notifications/services/index.ts`** — source of `notificationsService`; this controller is the only caller of its `listVisible` method in the module.
- **`src/modules/notifications/routes.ts`** — registers `getNotifications` as the handler for the `GET /notifications` endpoint.
- **`src/types/index.ts`** — supplies the `NotificationsResponse` type used to type-parameterise the success response.

## Notes

- `request.caller!` uses a non-null assertion; the upstream middleware (outside this file) is assumed to guarantee that a caller is present. There is no guard here.
- The controller is intentionally side-effect-free beyond calling the service and writing the response—no business logic lives in this file.
- Error handling is fully delegated to `catchAs`; the `'listNotifications'` string is the operation identifier that will appear in the error response body.
