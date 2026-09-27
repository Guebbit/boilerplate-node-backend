---
source: src/modules/webhooks/controllers/list-subscriptions.ts
sha256: b12bb5871b1ab346ad2257939ea540a6af8dc34d45c55b291af2a510196b9bff
generated_at: 2026-09-27T15:41:16.515132+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/list-subscriptions.ts

## Purpose

Controller for `GET /webhooks/subscriptions`. Returns the calling tenant's webhook subscriptions (newest first) with pagination, and guarantees no secret material is included in the response.

## Key elements

- **`listWebhookSubscriptions`** (export) — The controller built via `createListController`. Accepts optional `page`, `pageSize`, and `enabled` query params, then delegates to `webhooksService.listSubscriptions`.
- **Schema** — `ListWebhookSubscriptionsQueryParams` extended with infra `pageSchema`/`pageSizeSchema`, then made `.partial()` so every param is optional.
- **`input: { booleans: ['enabled'] }`** — Tells the list-controller factory to pre-decode the `enabled` query string into a boolean before the schema parses it.
- **`runList`** — The service callback; extracts the tenant context via `tenantCallerContextOf(request)` and passes it plus the parsed params to the service.

## Relationships

- **`create-list-controller.ts`** — Provides the `createListController` factory; this file is one of its consumers, supplying `entity`, `schema`, `input`, and `runList`.
- **`request.ts`** — Provides `tenantCallerContextOf`, used inside `runList` to derive the caller's tenant identity from the incoming request.
- **`schemas.ts`** — Provides `pageSchema` and `pageSizeSchema`, the canonical pagination primitives that replace any module-local page/pageSize definitions.
- **`../services` (`index.ts`)** — Exposes `webhooksService`; this controller calls `webhooksService.listSubscriptions`.
- **`types/index.ts`** — Source of the `WebhookSubscriptionsResponse` return type.
- **`routes.ts`** — The routes file for the webhooks module; this controller is the handler wired to the `GET /webhooks/subscriptions` route.

## Notes

- All query params are optional (`.partial()`). An absent `page` or `pageSize` is intentionally left undefined so that `normalizePagination` inside `createListController` can apply its defaults — do not add `.default()` here.
- The `enabled` filter is a string-boolean (`"true"`/`"false"`) in the raw query string; the `booleans` option handles decoding before schema validation, so the schema itself should not re-interpret it.
- The doc comment explicitly states the endpoint **never returns a secret**; the service layer is responsible for stripping it, not this controller.
