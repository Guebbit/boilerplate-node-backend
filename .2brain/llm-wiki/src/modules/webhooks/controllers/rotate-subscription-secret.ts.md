---
source: src/modules/webhooks/controllers/rotate-subscription-secret.ts
sha256: 8924798cbdc71b67f6ae7b0a74f3666af46c21770a02fde5663fd418d4f59d75
generated_at: 2026-10-15T12:18:31.251506+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/rotate-subscription-secret.ts

## Purpose

Handler for `POST /webhooks/subscriptions/:id/rotate-secret`. It mints a new ring secret for a webhook subscription and returns the plaintext secret exactly once in the response body. The old secret remains active until it is explicitly revoked via `DELETE …/secrets/:secretId`.

## Key elements

- **`rotateWebhookSubscriptionSecret`** (exported) — Express handler that:
  1. Extracts and validates the `:id` route param via `requireId`.
  2. Delegates to `webhooksService.rotateSubscriptionSecret(id, tenantContext)`.
  3. On success, responds with the presented subscription object spread together with `newSecret`.
  4. On refusal/error, short-circuits via `refused` / `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — provides `catchAs` (uniform error mapping) and `refused` (early-return for rejected results).
- **`src/infrastructure/http/ids.ts`** — provides `requireId` to pull and validate the `:id` param before any service call.
- **`src/infrastructure/http/request.ts`** — provides `tenantCallerContextOf` to derive the tenant/caller context passed into the service.
- **`src/infrastructure/http/response.ts`** — provides `successResponse` to serialize the final JSON body.
- **`src/modules/webhooks/services/index.ts`** — `webhooksService.rotateSubscriptionSecret` performs the actual rotation; this controller is its only caller.
- **`src/modules/webhooks/presenters.ts`** — `presentWebhookSubscription` shapes the raw subscription into the public API representation.
- **`src/modules/webhooks/routes.ts`** — upstream route table that wires this handler to the URL (this file does not import routes; the dependency is the reverse).
- **`src/types/index.ts`** — supplies the `WebhookSubscriptionCreated` type used to annotate the response payload.

## Notes

- The response body is typed as `WebhookSubscriptionCreated` but actually carries an extra `newSecret` field beyond what that type describes — consumers must read `newSecret` from the response even though it is not part of the declared shape.
- The plaintext secret is returned **once**. Subsequent `GET` calls on the subscription will not include it; callers must persist it at rotation time.
- Rotation does **not** invalidate the previous secret. Both secrets are valid until the old one is explicitly deleted — useful for zero-downtime key rotation, but easy to overlook when writing cleanup jobs.
