---
source: src/modules/webhooks/controllers/list-subscriptions.ts
sha256: 69cc8002cd89730a37556879c17f70d75c9644379941eb7b3eb452efc050d1ab
generated_at: 2026-10-29T06:26:02.114735+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/list-subscriptions.ts

## Purpose

HTTP controller for `GET /webhooks/subscriptions`. Returns the calling tenant's webhook subscriptions (newest first by default), with pagination and filter parameters, delegating to the webhooks service layer.

## Key elements

- **`listWebhookSubscriptions`** (exported) — The route handler, built by the `createListController` factory. Configures:
  - `entity: 'webhookSubscriptions'` — identifier used by the factory.
  - `schema` — `ListWebhookSubscriptionsQueryParams` (from `@api/schemas.zod`) extended with `pageSchema` / `pageSizeSchema`, then `.partial()` so every param is optional.
  - `input` — declares `booleans: ['enabled', 'autoDisabled']` and `csvLists: ['sort']` so the infra layer pre-decodes those before the schema sees them.
  - `runList` — calls `webhooksService.listSubscriptions(tenantCallerContextOf(request), parsed)` and returns a `WebhookSubscriptionsResponse`.

## Relationships

- **`src/infrastructure/surfaces/create-list-controller.ts`** — provides the `createListController` factory that assembles the final handler from the options object defined here.
- **`src/infrastructure/http/schemas.ts`** — supplies `pageSchema` and `pageSizeSchema` used to extend the query-params schema.
- **`src/infrastructure/http/request.ts`** — supplies `tenantCallerContextOf`, which extracts the tenant-scoped caller context from the incoming request for the service call.
- **`src/modules/webhooks/services/index.ts`** — source of `webhooksService`; its `listSubscriptions` method performs the actual data retrieval.
- **`src/types/index.ts`** — defines `WebhookSubscriptionsResponse`, the return type of `runList`.
- **`src/modules/webhooks/routes.ts`** — registers `listWebhookSubscriptions` on the `GET /webhooks/subscriptions` route.

## Notes

- The schema is `.partial()`: every query param (`page`, `pageSize`, `enabled`, `autoDisabled`, `sort`, etc.) is optional. Absent `page`/`pageSize` are intentionally left undefined so the infra layer's `normalizePagination` can apply its own defaults.
- `enabled` and `autoDisabled` arrive as already-decoded booleans (handled by `readInput`'s `booleans` config), and `sort` arrives as an already-split array (handled by `csvLists`). The Zod schema here validates the post-decoded shapes, not raw query strings.
- The doc comment explicitly guarantees this endpoint never returns a webhook secret.
