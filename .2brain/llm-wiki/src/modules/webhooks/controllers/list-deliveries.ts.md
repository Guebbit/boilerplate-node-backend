---
source: src/modules/webhooks/controllers/list-deliveries.ts
sha256: f83e7ccf0eedf3241cab6045b979b62a434d740275ba2d2ebcbec30046928704
generated_at: 2026-09-23T19:38:47.464655+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/list-deliveries.ts

## Purpose

HTTP controller for `GET /webhooks/deliveries`. Returns the calling tenant's webhook delivery log (newest first) with optional filtering by subscription and/or status and standard pagination. It is a thin adapter that validates query params and delegates the actual query to the webhooks service.

## Key elements

- **`listWebhookDeliveries`** (exported) – The list controller built via `createListController`. Declares entity `'webhookDeliveries'`, a composed query-params schema, and a `runList` callback that calls `webhooksService.listDeliveries` with the tenant context and parsed params.
- **Query-params schema** – `ListWebhookDeliveriesQueryParams` (from `@api/schemas.zod`) extended with infra `pageSchema`/`pageSizeSchema`, then made fully optional via `.partial()`. The `status` field is closed to the generated wire enum.

## Relationships

- **`@infrastructure/surfaces/create-list-controller`** – Provides the `createListController` factory that assembles the route handler, param parsing, and pagination normalization.
- **`@infrastructure/http/schemas`** – Supplies `pageSchema` and `pageSizeSchema`, the canonical pagination param definitions.
- **`@infrastructure/http/request`** – Supplies `tenantCallerContextOf` to extract the authenticated tenant context from the incoming request.
- **`../services`** (`webhooksService`) – The domain service whose `listDeliveries` method performs the actual data retrieval.
- **`@types`** – Provides the `WebhookDeliveriesResponse` return type.
- **`src/modules/webhooks/routes.ts`** – Registers `listWebhookDeliveries` as the handler for the `GET /webhooks/deliveries` route.

## Notes

- `status` is intentionally a closed enum (matching the convention used by audit-logs' `outcome`): an unrecognised value produces a 422 rather than silently matching every row.
- `page`/`pageSize` are swapped to the infra pair *before* `.partial()` so that an absent value remains absent in the parsed object, allowing `normalizePagination` (inside `createListController`) to apply its defaults. The Zod-generated schemas are *not* used here.
