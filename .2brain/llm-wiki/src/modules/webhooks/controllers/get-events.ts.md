---
source: src/modules/webhooks/controllers/get-events.ts
sha256: 9dfd63a7347cf11f21a9c63985c078449df86303b4d03749f6c7d536dba29fef
generated_at: 2026-11-08T09:01:01.154247+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/get-events.ts

## Purpose

Express controller that handles `GET /webhooks/events`, returning the full list of webhook events available for subscription filtering. The catalogue data originates from the project's `asyncapi.yaml` specification and is exposed here as a simple JSON array.

## Key elements

- **`listWebhookEvents`** — The sole export. A synchronous Express handler `(req, res) => void` that calls `webhooksService.listWebhookEventCatalog()`, wraps the result in `{ items: [...] }`, and sends it via `successResponse`.

## Relationships

- **`src/infrastructure/http/response.ts`** — Imports `successResponse` to format the JSON envelope and set the HTTP status.
- **`src/modules/webhooks/routes.ts`** — Registers `listWebhookEvents` as the handler for the `GET /webhooks/events` route.
- **`src/modules/webhooks/services/index.ts`** — Imports `webhooksService`; calls `listWebhookEventCatalog()` to retrieve the event entries.
- **`src/types/index.ts`** — Imports the `WebhookEventCatalogEntry` type used to type the response payload.

## Notes

- The request parameter is intentionally unused (prefixed with `_`); the endpoint takes no query/body input.
- The catalogue array is spread (`[...]`) before being sent, so the service's internal array is not exposed by reference.
- Data source is the `asyncapi.yaml` file (noted in the JSDoc), meaning changes to that spec are the upstream driver for this endpoint's output.
