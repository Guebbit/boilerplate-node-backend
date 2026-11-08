---
source: src/modules/webhooks/controllers/get-subscriptions.ts
sha256: 69cc8002cd89730a37556879c17f70d75c9644379941eb7b3eb452efc050d1ab
generated_at: 2026-11-08T09:01:20.016252+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/subscriptions/controllers/get-subscriptions.ts

## Purpose

HTTP controller for `GET /webhooks/subscriptions`. It exposes the tenant's webhook subscriptions as a paginated, filterable list (newest-first by default) while guaranteeing that no secret material is returned. It delegates the actual data-fetching to the webhooks service and relies on the shared list-controller factory for pagination, input decoding, and response shaping.

## Key elements

- **`listWebhookSubscriptions`** (exported const) — The single endpoint handler, produced by `createListController`. Configured with:
  - `entity: 'webhookSubscriptions'`
  - `schema` — `ListWebhookSubscriptionsQueryParams` extended with infra `page`/`pageSize` schemas, then `.partial()` so every param is optional.
  - `input.booleans: ['enabled', 'autoDisabled']` — flags pre-decoded by the infra `readInput` step.
  - `input.csvLists: ['sort']` — comma-separated sort keys split into an array.
  - `runList(parsed, request)` — calls `webhooksService.listSubscriptions(tenantCallerContextOf(request), parsed)` and returns `Promise<WebhookSubscriptionsResponse>`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `@infrastructure/http/schemas` | Imports `pageSchema` and `pageSizeSchema` to replace the API-level pagination fields with the infra-standard pair. |
| `@infrastructure/surfaces/create-list-controller` | Calls `createListController` to assemble the full request→parse→run→respond pipeline around `runList`. |
| `@infrastructure/http/request` | Calls `tenantCallerContextOf(request)` inside `runList` to resolve the calling tenant's context before hitting the service. |
| `../services` (webhooks services barrel) | Imports `webhooksService` and calls `listSubscriptions` to perform the actual query. |
| `@types` | Imports the `WebhookSubscriptionsResponse` type used as the return type of `runList`. |
| `src/modules/webhooks/routes.ts` | Registers `listWebhookSubscriptions` on the `GET /webhooks/subscriptions` route. |

## Notes

- **Pagination defaulting:** `page` and `pageSize` are intentionally the *infra* schemas (not the API-level ones) so that when a client omits them the values stay `undefined` and `normalizePagination` (inside `create-list-controller`) can apply its defaults.
- **Boolean / CSV decoding is declarative:** `enabled`, `autoDisabled`, and `sort` are not manually parsed in this file; the `input` config tells `createListController`'s `readInput` step how to coerce them before they reach `runList`.
- **Secrets:** The module-level JSDoc explicitly states this endpoint *never returns a secret*. Enforced downstream in the service/mapper, not here.
- **Partial schema:** `.partial()` on the extended schema means every query param is optional; the controller relies on the service to apply sensible defaults.
