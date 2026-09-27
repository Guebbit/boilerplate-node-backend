---
source: src/modules/webhooks/controllers/list-events.ts
sha256: bee43bb185ef46792fa81ba705830377229c49a3f4e5248c3384a879c0436f85
generated_at: 2026-09-27T15:41:06.627334+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/list-events.ts

## Purpose

Express controller that handles `GET /webhooks/events`. It returns the full list of webhook event catalogue entries (sourced from `../asyncapi.yaml` upstream) so that clients and API consumers can discover every event a subscription may filter on.

## Key elements

- **`listWebhookEvents`** (exported) — The sole handler. Accepts an unused `Request` and a `Response`; calls `listWebhookEventCatalogue()` from the webhooks services barrel, spreads the result into an array, and returns it via `successResponse` typed as `WebhookEventCatalogueEntry[]`.

## Relationships

- **`src/modules/webhooks/routes.ts`** — Registers `listWebhookEvents` as the handler for the `GET /webhooks/events` route.
- **`src/modules/webhooks/services/index.ts`** — Barrel module that re-exports `listWebhookEventCatalogue` (defined in `catalogue.ts`); this file imports from that barrel.
- **`src/modules/webhooks/services/catalogue.ts`** — Provides the `listWebhookEventCatalogue` function whose return value is spread into the response body.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse`, the standard envelope wrapper used here.
- **`src/types/index.ts`** — Defines the `WebhookEventCatalogueEntry` type used as the generic parameter of `successResponse`.

## Notes

- The `request` parameter is intentionally unused (prefixed `_`); the endpoint takes no query params or path variables.
- The catalogue is read at request time (the function is called inside the handler), so any runtime re-evaluation of the YAML-derived data would be reflected.
- The handler is synchronous and returns the wrapped value directly (no `next` callback, no `res.json` call) — consistent with the `successResponse` helper contract.
