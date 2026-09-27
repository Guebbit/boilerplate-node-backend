---
source: src/modules/webhooks/controllers/list-deliveries.ts
sha256: fce007350d916e6678fc1fbf5ba3a486a41d36bca81fc89c58657fa4a17f8fa4
generated_at: 2026-09-27T15:40:59.556907+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/list-deliveries.ts

## Purpose

Controller for `GET /webhooks/deliveries`. It exposes a tenant's webhook delivery log (newest first) with optional filtering by subscription and/or status, delegating the actual query to the webhooks service.

## Key elements

- **`listWebhookDeliveries`** (exported) — A list controller built via `createListController` for the `webhookDeliveries` entity. Accepts query params validated against `ListWebhookDeliveriesQueryParams` (extended with infra `page`/`pageSize` schemas, then made `.partial()`). On invocation it extracts the tenant caller context and calls `webhooksService.listDeliveries`, returning a `WebhookDeliveriesResponse`.

## Relationships

- **`src/infrastructure/surfaces/create-list-controller.ts`** — Factory that wraps the controller logic (routing, param parsing, error handling) around the `runList` callback defined here.
- **`src/infrastructure/http/schemas.ts`** — Supplies `pageSchema` and `pageSizeSchema` so pagination params use the shared infra definitions.
- **`src/infrastructure/http/request.ts`** — Provides `tenantCallerContextOf`, used to derive the tenant-scoped context passed to the service.
- **`src/modules/webhooks/services/index.ts`** — Exports `webhooksService`, whose `listDeliveries` method performs the actual data retrieval.
- **`src/modules/webhooks/routes.ts`** — Registers `listWebhookDeliveries` on the `GET /webhooks/deliveries` route.
- **`src/types/index.ts`** — Source of the `WebhookDeliveriesResponse` return type.

## Notes

- The `status` query param is a **closed** (non-`.passthrough()`) zod enum inherited from `ListWebhookDeliveriesQueryParams`; an unrecognized value yields a 422 rather than silently matching all rows.
- `page`/`pageSize` are deliberately swapped to the infra schema pair so that when a value is **absent** it stays `undefined`, allowing `normalizePagination` (inside `createListController`) to apply its defaults.
- The extended schema is `.partial()`-ed, making every query param optional.
