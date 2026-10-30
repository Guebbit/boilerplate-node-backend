---
source: src/modules/webhooks/controllers/get-delivery.ts
sha256: f0ec0a4f28183212d534806a80777959c205e8c1e4c4d51948bf7432fc483ce8
generated_at: 2026-10-29T06:25:38.259672+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/get-delivery.ts

## Purpose

Handles the `GET /webhooks/deliveries/:id` endpoint by fetching a single webhook delivery record for the authenticated tenant. It validates the id, delegates to the webhooks service, and shapes the HTTP response.

## Key elements

- **`getWebhookDelivery`** (exported function) — The sole controller. Accepts an Express `Request<{ id: string }>` and `Response`. Validates the `:id` param, calls `webhooksService.getDelivery`, then either returns the delivery payload via `successResponse` or a 404 via `refused`. All errors are funneled through `catchAs`.

## Relationships

- **`src/infrastructure/http/ids.ts`** — `requireId` validates the route param; on failure it writes a 404 (`generic.error-item-gone`) and returns `null`, short-circuiting the handler.
- **`src/infrastructure/http/request.ts`** — `tenantCallerContextOf` extracts the tenant-scoped caller context passed to the service.
- **`src/modules/webhooks/services/index.ts`** — `webhooksService.getDelivery` performs the actual lookup; returns a result object that may be "refused" (tenant mismatch / not found) or carry data.
- **`src/infrastructure/http/controller.ts`** — `refused` inspects the service result and emits the 404; `catchAs` wraps unhandled rejections into a consistent error response.
- **`src/infrastructure/http/response.ts`** — `successResponse` serializes the `WebhookDelivery` payload into the HTTP 200 body.
- **`src/types/index.ts`** — Supplies the `WebhookDelivery` type used as the response generic.
- **`src/modules/webhooks/routes.ts`** — Registers this handler on the `GET /webhooks/deliveries/:id` route.

## Notes

- The 404 message is deliberately generic (`generic.error-item-gone`) — a delivery belonging to another tenant is indistinguishable from a nonexistent one, preventing id enumeration.
- The handler is promise-based (`.then`/`.catch`) rather than async/await, consistent with the controller-layer convention seen in the `catchAs` helper.
