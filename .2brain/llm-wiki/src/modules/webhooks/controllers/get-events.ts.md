---
source: src/modules/webhooks/controllers/get-events.ts
sha256: bce78f9a7947f85e427efbc6bf6812a8df1533a3bc438ceee9092d0730c78d51
generated_at: 2026-11-14T22:41:22.143086+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/get-events.ts

## Purpose

Express controller that serves `GET /webhooks/events`, returning the catalogue of all events a subscription may filter on, annotated with whether the authenticated caller holds the read rule needed to subscribe to each one.

## Key elements

- **`listWebhookEvents(request, response)`** — the sole export. An Express handler that extracts the caller via `tenantCallerContextOf`, delegates to `webhooksService.listWebhookEventCatalog(caller)`, and wraps the result in a `successResponse` with shape `{ items: WebhookEventCatalogEntry[] }`.

## Relationships

- **`src/infrastructure/http/request.ts`** — imports `tenantCallerContextOf` to pull the caller's identity from the Express `Request`.
- **`src/infrastructure/http/response.ts`** — imports `successResponse` to emit the standard JSON success envelope.
- **`src/modules/webhooks/services/index.ts`** — imports `webhooksService` and calls its `listWebhookEventCatalog` method to fetch the filtered catalogue.
- **`src/modules/webhooks/routes.ts`** — (upstream consumer) wires `listWebhookEvents` to the `GET /webhooks/events` route.
- **`src/types/index.ts`** — provides the `WebhookEventCatalogEntry` type that describes each item in the returned array.

## Notes

- The handler is intentionally thin: all authorization (per-event read-rule checks) and catalogue construction live in the service layer, so the controller never inspects rules directly.
- The response shape is always `{ items: [...] }`; there is no pagination or filtering query-parameter handling visible here.
