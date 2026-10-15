---
source: src/modules/webhooks/controllers/remove-subscription-secret.ts
sha256: 24668a1802a138d16dc1f37064a4b16121eb111679c9d4c9f04060ec965f5439
generated_at: 2026-10-15T12:18:10.005357+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/remove-subscription-secret.ts

## Purpose

Thin HTTP controller for `DELETE /webhooks/subscriptions/:id/secrets/:secretId`. It validates the subscription ID, delegates the actual ring-entry removal to `webhooksService`, and shapes the resulting `WebhookSubscription` into an HTTP response. It exists to isolate the request/response lifecycle (param extraction, tenant context, error mapping) from the domain logic.

## Key elements

- **`removeWebhookSubscriptionSecret(request, response)`** — The sole export. Handler for the DELETE route. Validates `:id` via `requireId`, calls `webhooksService.removeSubscriptionSecret(id, secretId, tenantCtx)`, then either returns `successResponse` with the presented subscription or short-circuits through `refused` (4xx) / `catchAs` (5xx).

## Relationships

- **`@infrastructure/http/ids`** — `requireId` extracts and validates the `:id` param; on failure it writes a 404 and the handler returns early.
- **`@infrastructure/http/request`** — `tenantCallerContextOf` derives the tenant/caller context passed as the third argument to the service.
- **`@infrastructure/http/response`** — `successResponse` wraps the 200 body.
- **`@infrastructure/http/controller`** — `refused` maps service-level "not found / validation failed" results to 404/422; `catchAs` turns unhandled exceptions into a 500 with a stable log tag.
- **`../services`** — `webhooksService.removeSubscriptionSecret` performs the actual ring mutation (404 if secret ID absent, 422 if it would empty the ring).
- **`../presenters`** — `presentWebhookSubscription` converts the domain `WebhookSubscription` into the wire-format payload.
- **`@types`** — `WebhookSubscription` type parameterises the response generic.
- **`routes.ts`** — Registers this handler on the `DELETE /webhooks/subscriptions/:id/secrets/:secretId` route.

## Notes

- Business rules live in the service, not here: 404 when the `secretId` is not in the ring; 422 when removal would leave zero secrets (a subscription without a secret cannot sign deliveries).
- Follows the same `requireId → service → refused → successResponse → catchAs` pattern as every other webhooks controller, keeping the file ~30 lines and trivially reviewable.
- The `catchAs` tag is the literal string `'removeWebhookSubscriptionSecret'` — use it to grep server logs for this endpoint's errors.
