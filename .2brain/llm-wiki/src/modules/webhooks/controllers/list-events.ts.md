---
source: src/modules/webhooks/controllers/list-events.ts
sha256: 7b0815b909a263f157585397e1d09ca6cb89e41336ef44857351cfa0abb5abf2
generated_at: 2026-09-23T19:38:53.603452+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/list-events.ts

## Purpose

Express controller for the `GET /webhooks/events` endpoint. It returns the full webhook event catalogue (sourced from `asyncapi.yaml`) as a JSON array, giving API consumers a list of every event a subscription can filter on.

## Key elements

- **`listWebhookEvents`** (exported) — Express handler (`(req, res) => void`). Calls `listWebhookEventCatalogue()`, spreads the result into a fresh array, and sends it via `successResponse<WebhookEventCatalogueEntry[]>`. Ignores the request object entirely (prefixed `_request`).

## Relationships

- **`src/modules/webhooks/routes.ts`** — registers `listWebhookEvents` as the handler for the `GET /webhooks/events` route.
- **`src/modules/webhooks/services/index.ts`** — barrel re-export that this controller imports `listWebhookEventCatalogue` from.
- **`src/modules/webhooks/services/catalogue.ts`** — actual implementation of `listWebhookEventCatalogue`; the source of the data returned.
- **`src/infrastructure/http/response.ts`** — provides the `successResponse` helper used to shape the HTTP reply.
- **`src/types/index.ts`** — defines the `WebhookEventCatalogueEntry` type that parameterises the response payload.

## Notes

- The controller spreads the catalogue result (`[...]`) before passing it to `successResponse`, guaranteeing the response body is a plain array even if the service returns a non-standard iterable.
- No authentication, pagination, or query-parameter filtering is applied here — the full catalogue is always returned.
- The request parameter is unused; any future filtering or auth middleware would need to be added at the route level (in `routes.ts`).
