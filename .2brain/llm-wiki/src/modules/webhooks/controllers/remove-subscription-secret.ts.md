---
source: src/modules/webhooks/controllers/remove-subscription-secret.ts
sha256: 51fc9d60b5590b73a74a48a74bebd0dc1643a56a0608ce81f99b4fcca21dc7fb
generated_at: 2026-10-29T06:26:12.515415+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/remove-subscription-secret.ts

## Purpose

Controller for `DELETE /webhooks/subscriptions/:id/secrets/:secretId`. Removes a single secret from a subscription's rotation ring (the "other half" of a key rotation, once all consumers have switched). Enforces that the ring is never left empty, since a subscription with no secret cannot sign a delivery.

## Key elements

- **`removeWebhookSubscriptionSecret`** (exported) – The sole handler. Validates the `:id` param via `requireId`, extracts tenant caller context, delegates to `webhooksService.removeSubscriptionSecret`, and responds with the updated subscription shape via `viewSubscription`. Uses `refused` for service-level rejections (e.g. 422 empty-ring guard) and `catchAs` for unexpected errors.

## Relationships

- **`src/modules/webhooks/routes.ts`** – Registers this function as the handler for the `DELETE /webhooks/subscriptions/:id/secrets/:secretId` route.
- **`src/modules/webhooks/services/index.ts`** – Provides `webhooksService`, whose `removeSubscriptionSecret` performs the actual ring-entry deletion.
- **`src/modules/webhooks/services/actions.ts`** – Supplies `viewSubscription` to project the updated subscription into the caller-facing shape.
- **`src/infrastructure/http/controller.ts`** – `catchAs` and `refused` handle error mapping and rejection signaling.
- **`src/infrastructure/http/ids.ts`** – `requireId` validates the `:id` route param and short-circuits with a 404 on failure.
- **`src/infrastructure/http/request.ts`** – `tenantCallerContextOf` derives the tenant/caller context from the incoming request.
- **`src/infrastructure/http/response.ts`** – `successResponse` builds the 200 envelope.
- **`src/types/index.ts`** – `WebhookSubscription` types the response payload.

## Notes

- The "ring" is a per-subscription collection of secrets used for rotation; this endpoint removes **one entry**, not all.
- The service enforces the 422 (Unprocessable Entity) when removal would empty the ring — this is a business rule surfaced through the `refused` check, not a standard 404.
- The handler is non-`async`; it returns the promise chain directly, which `routes.ts` can attach to the Express handler directly.
