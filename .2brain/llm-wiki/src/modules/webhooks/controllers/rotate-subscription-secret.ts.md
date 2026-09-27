---
source: src/modules/webhooks/controllers/rotate-subscription-secret.ts
sha256: 38e4f2293443db000afb231d1ebeca192818f74e6dfad42953861f7bd4cfc842
generated_at: 2026-09-27T15:41:37.352383+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/rotate-subscription-secret.ts

## Purpose

Controller for `POST /webhooks/subscriptions/:id/rotate-secret`. Validates the path ID, delegates to the webhooks service to mint a new ring secret, and returns the subscription along with the new plaintext secret (which is shown only once). The old secret remains active until explicitly deleted.

## Key elements

- **`rotateWebhookSubscriptionSecret`** — the sole export. Express handler that:
  1. Extracts and validates the `:id` path parameter (`extractAndValidateId`).
  2. Calls `webhooksService.rotateSubscriptionSecret(id, tenantCtx)`.
  3. On success, responds with `{ ...subscription.toJSON(), newSecret }` typed as `WebhookSubscriptionCreated & { newSecret: string }`.
  4. On rejection (`refused`) or error (`catchAs`), delegates to the shared controller helpers.

## Relationships

- **`src/modules/webhooks/services/index.ts`** — calls `webhooksService.rotateSubscriptionSecret(id, tenantCallerContextOf(request))` to perform the actual rotation.
- **`src/infrastructure/http/request.ts`** — uses `extractAndValidateId` (parse + validate path param) and `tenantCallerContextOf` (derive tenant context for the service call).
- **`src/infrastructure/http/response.ts`** — uses `successResponse` to shape the 200 payload.
- **`src/infrastructure/http/controller.ts`** — uses `refused` (short-circuit on a rejected result) and `catchAs` (map thrown errors to an HTTP error response).
- **`src/modules/webhooks/routes.ts`** — registers this handler at the `POST /webhooks/subscriptions/:id/rotate-secret` path.
- **`src/types/index.ts`** — imports the `WebhookSubscriptionCreated` wire type used in the response cast.

## Notes

- The subscription is returned via `.toJSON()` because the stored Mongoose document uses `_id`, while the `WebhookSubscriptionCreated` wire type expects `id`. The cast (`as WebhookSubscriptionCreated`) papers over this mismatch; the stored type and the wire type are intentionally different.
- Rotation is **additive**: the old secret is not invalidated here. Callers must issue `DELETE /webhooks/subscriptions/:id/secrets/:secretId` to retire it.
- The plaintext secret appears in the response body exactly once and is not recoverable afterward.
