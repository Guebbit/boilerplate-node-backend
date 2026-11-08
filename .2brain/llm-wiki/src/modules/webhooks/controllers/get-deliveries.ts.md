---
source: src/modules/webhooks/controllers/get-deliveries.ts
sha256: fce007350d916e6678fc1fbf5ba3a486a41d36bca81fc89c58657fa4a17f8fa4
generated_at: 2026-11-08T09:00:43.701647+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/get-deliveries.ts

## Purpose

Thin HTTP controller for `GET /webhooks/deliveries`. It validates query parameters, extracts tenant context from the request, and delegates to `webhooksService.listDeliveries`. Exists to keep route wiring (in `routes.ts`) free of validation and service-call logic.

## Key elements

- **`listWebhookDeliveries`** (exported) — The sole export. Built via `createListController` with entity name `'webhookDeliveries'`. Accepts a partial query schema (subscription, status, page, pageSize) and returns `Promise<WebhookDeliveriesResponse>`.
- **Query schema** — `ListWebhookDeliveriesQueryParams` extended with `pageSchema` / `pageSizeSchema`, then `.partial()`'d so every param is optional. The `status` field is constrained to the generated wire enum (unrecognised values → 422).

## Relationships

- **`create-list-controller` (infrastructure/surfaces)** — Factory that wraps schema validation, pagination normalization, and error shaping around the `runList` callback.
- **`webhooksService` (modules/webhooks/services)** — Called as `webhooksService.listDeliveries(tenantCtx, parsedParams)`; owns the actual data fetch.
- **`tenantCallerContextOf` (infrastructure/http/request)** — Extracts the tenant/caller identity from the incoming request object.
- **`pageSchema`, `pageSizeSchema` (infrastructure/http/schemas)** — Reused infra pagination schemas; kept separate from the API-level `ListWebhookDeliveriesQueryParams` so absent values stay `undefined` for `normalizePagination` to apply defaults.
- **`WebhookDeliveriesResponse` (types)** — Return type annotation on the `runList` callback.
- **`routes.ts` (modules/webhooks)** — Registers `listWebhookDeliveries` on the `GET /webhooks/deliveries` route.

## Notes

- The schema is `.partial()` — every query param is optional. Pagination defaults are applied downstream by `normalizePagination` inside `createListController`, not here.
- `status` is intentionally closed to the generated enum (mirrors the `audit-logs` `outcome` pattern) so a typo yields a 422 rather than silently returning all rows.
- The `page`/`pageSize` fields are swapped for the infra pair specifically so that an absent value remains `undefined` (rather than defaulting to `1`/`20` at the schema level) and is handled uniformly by the list-controller factory.
