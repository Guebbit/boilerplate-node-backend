---
source: src/modules/webhooks/controllers/list-events.ts
sha256: d1a329c5ce9a2864c034798e6ddb9fd832ad24310fea1bdee66194032c81d271
generated_at: 2026-10-29T06:25:50.601427+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/list-events.ts

## Purpose

A single-export Express controller that serves the public webhook event catalogue at `GET /webhooks/events`. It delegates to the webhooks service to retrieve the list of events a subscription may filter on (sourced from `asyncapi.yaml`) and wraps them in a standard success envelope.

## Key elements

- **`listWebhookEvents(request, response)`** — The only export. Reads the event catalogue via `webhooksService.listWebhookEventCatalogue()`, spreads it into a fresh array, and returns it as `{ items: WebhookEventCatalogueEntry[] }` through `successResponse`. The `request` parameter is intentionally unused (prefixed `_`).

## Relationships

- **`src/infrastructure/http/response.ts`** — Consumes `successResponse` to shape the HTTP 200 reply consistently with the rest of the API.
- **`src/modules/webhooks/services/index.ts`** — Calls `webhooksService.listWebhookEventCatalogue()` to obtain the catalogue data.
- **`src/types/index.ts`** — Imports `WebhookEventCatalogueEntry` for the response type annotation.
- **`src/modules/webhooks/routes.ts`** — Registers this function as the handler for the `GET /webhooks/events` route.

## Notes

- The spread `[...webhooksService.listWebhookEventCatalogue()]` creates a shallow copy each call, preventing a caller from mutating the service's internal reference (e.g., if it returns a cached array).
- The controller is synchronous and stateless; no middleware (auth, validation) is applied here — those concerns live in `routes.ts`.
