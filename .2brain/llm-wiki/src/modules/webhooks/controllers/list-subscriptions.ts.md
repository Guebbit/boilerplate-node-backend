---
source: src/modules/webhooks/controllers/list-subscriptions.ts
sha256: e738c4431c9254beb53f00316e22fc3ee8e0de908cbb20b426d59d761d7f5c67
generated_at: 2026-09-23T19:39:02.250249+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/list-subscriptions.ts

## Purpose

Defines the `GET /webhooks/subscriptions` controller. It returns the calling tenant's webhook subscriptions (newest first) with pagination, and guarantees no secret material is exposed.

## Key elements

- **`listWebhookSubscriptions`** (export) — The sole export. Built via `createListController` with:
    - `entity: 'webhookSubscriptions'` — identifies the resource for logging/auditing.
    - `schema` — `ListWebhookSubscriptionsQueryParams` extended with infra-level `pageSchema` / `pageSizeSchema`, then `.partial()` so all query params remain optional.
    - `input.booleans: ['enabled']` — tells the infra layer to pre-decode the `enabled` query param to a boolean.
    - `runList` — delegates to `webhooksService.listSubscriptions`, passing the extracted tenant caller context and the parsed query params.

## Relationships

- **`@infrastructure/surfaces/create-list-controller`** — Provides the `createListController` factory that wraps the `runList` callback into a fully wired HTTP handler (validation, pagination normalization, error handling).
- **`@infrastructure/http/schemas`** — Supplies `pageSchema` and `pageSizeSchema`, which replace any module-local pagination fields so that absent values stay `undefined` until `normalizePagination` applies defaults.
- **`@infrastructure/http/request`** — Supplies `tenantCallerContextOf(request)` to derive the tenant-scoped caller context from the incoming request.
- **`@modules/webhooks/services`** — The `webhooksService.listSubscriptions` method performs the actual data retrieval.
- **`@types`** — Provides the `WebhookSubscriptionsResponse` return-type contract.
- **`@modules/webhooks/routes`** — Registers `listWebhookSubscriptions` on the `GET /webhooks/subscriptions` route.

## Notes

- The `.partial()` call after extending the schema is deliberate: it keeps `page`/`pageSize` optional so the infra layer's `normalizePagination` can fill in defaults rather than the schema enforcing a value.
- `enabled` is listed under `input.booleans` because the raw query string arrives as a string; the infra layer coerces it before `runList` sees it.
- The JSDoc explicitly states the endpoint "never returns a secret" — treat any future schema additions with that invariant in mind.
