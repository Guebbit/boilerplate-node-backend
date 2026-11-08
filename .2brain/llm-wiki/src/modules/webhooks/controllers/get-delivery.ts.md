---
source: src/modules/webhooks/controllers/get-delivery.ts
sha256: f0ec0a4f28183212d534806a80777959c205e8c1e4c4d51948bf7432fc483ce8
generated_at: 2026-11-08T09:00:54.243270+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/get-delivery.ts

## Purpose

HTTP controller for the `GET /webhooks/deliveries/:id` route. It extracts and validates the delivery ID, delegates the fetch to the webhooks service scoped to the caller's tenant, and shapes the response. It exists to keep the route handler thin and to centralise the "not found / not yours" security contract in one place.

## Key elements

- **`getWebhookDelivery(request, response)`** — The sole export. A plain Express handler that:
  1. Calls `requireId` to pull and validate `:id` from the request params (returns a generic 404 if absent or malformed).
  2. Calls `webhooksService.getDelivery(id, tenantCallerContextOf(request))`.
  3. Checks the result with `refused` (handles tenant-ownership failures as 404).
  4. Serialises a successful result via `successResponse<WebhookDelivery>`.
  5. Catches any thrown error through `catchAs(response, 'getWebhookDelivery')`.

## Relationships

- **`src/modules/webhooks/routes.ts`** — Registers `getWebhookDelivery` as the handler for the `GET /webhooks/deliveries/:id` route.
- **`src/modules/webhooks/services/index.ts`** — Provides `webhooksService.getDelivery`, the domain operation that actually looks up the delivery record.
- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs` (unified error formatting) and `refused` (tenant-ownership rejection → 404).
- **`src/infrastructure/http/ids.ts`** — Supplies `requireId`, which extracts the route param and short-circuits with a 404 if it is missing or invalid.
- **`src/infrastructure/http/request.ts`** — Supplies `tenantCallerContextOf`, which derives the tenant identifier from the incoming request for service scoping.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse`, the standard envelope for 200 payloads.
- **`src/types/index.ts`** — Provides the `WebhookDelivery` type used as the generic parameter for the success response.

## Notes

- **Security-by-404:** A missing ID, a malformed ID, and a delivery belonging to a different tenant all produce the same generic 404 (`generic.error-item-gone`). This prevents an attacker from probing for valid IDs or confirming cross-tenant existence.
- **Promise chain, not async/await:** The handler uses `.then/.catch` rather than `async`/`await`; keep this style consistent if editing.
- **`refused` before `successResponse`:** The service can return a "refused" result (e.g. wrong tenant) without throwing; forgetting the `refused` check would leak cross-tenant data as a 200.
