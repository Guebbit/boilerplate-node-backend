---
source: src/modules/webhooks/controllers/remove-subscription-secret.ts
sha256: 8917dfaff59db121fd2e0929dced80231bdca92034ad37e62cbcd8248c31a317
generated_at: 2026-09-27T15:41:27.036360+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/remove-subscription-secret.ts

## Purpose

Controller handler for `DELETE /webhooks/subscriptions/:id/secrets/:secretId`. It drops a single secret (ring entry) from a webhook subscription as the second half of a key rotation, once all consumers have switched. It guards against removing the last secret in the ring (422) and unknown ids (404), then returns the updated subscription document.

## Key elements

- **`removeWebhookSubscriptionSecret`** (exported) — The Express handler. Validates the `id` path param via `extractAndValidateId`, delegates to `webhooksService.removeSubscriptionSecret`, then either sends a success response with the subscription or short-circuits on a `refused` result. Errors are funneled through `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs` (unified error-to-HTTP mapping) and `refused` (detects rejection results and writes the error response).
- **`src/infrastructure/http/request.ts`** — Supplies `extractAndValidateId` (validates the subscription `id` param) and `tenantCallerContextOf` (derives the tenant-scoped caller context passed to the service).
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse` to build the 200 JSON body.
- **`src/modules/webhooks/services/index.ts`** — Exposes `webhooksService.removeSubscriptionSecret`, which performs the actual ring-entry removal and returns the updated document or a rejection.
- **`src/modules/webhooks/routes.ts`** — Registers this handler on the `DELETE /webhooks/subscriptions/:id/secrets/:secretId` route.
- **`src/types/index.ts`** — Provides the `WebhookSubscription` type used for the success-response payload.

## Notes

- The service returns a Mongoose document; the handler calls `.toJSON()` to apply the model's `_id` → `id` transform, then casts to `WebhookSubscription` because the stored shape and the wire shape differ. The cast is necessary and intentional, not a type error.
- This endpoint is deliberately the *last* step of a rotation: the caller is expected to have already added the new secret and migrated all consumers before invoking it.
- A subscription whose ring would become empty is rejected (422) — a subscription with zero secrets cannot sign deliveries.
