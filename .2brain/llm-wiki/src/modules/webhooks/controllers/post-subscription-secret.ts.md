---
source: src/modules/webhooks/controllers/post-subscription-secret.ts
sha256: ba5ad7c7656650723bca81332c11b5834b1af7879d5da3d12c7d4ef20ccbe50d
generated_at: 2026-11-08T09:01:55.956361+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/post-subscription-secret.ts

## Purpose

HTTP controller for `POST /webhooks/subscriptions/:id/secrets`. It validates the subscription ID, delegates secret creation to the webhooks service, and returns the new ring secret plaintext exactly once in the response body while the previous secret remains active.

## Key elements

- **`createWebhookSubscriptionSecret`** (exported) – Express handler that:
  - Extracts and validates the `:id` path param via `requireId`.
  - Resolves tenant/caller context from the request.
  - Calls `webhooksService.createSubscriptionSecret(id, context)`.
  - On success, responds with the subscription view (via `viewSubscription`) plus a `newSecret` field.
  - On service-level refusal, short-circuits with `refused`.
  - Catches unexpected errors through `catchAs`.

## Relationships

- **`@infrastructure/http/controller`** – `refused` (service-level rejection check) and `catchAs` (uniform error serialization).
- **`@infrastructure/http/ids`** – `requireId` validates the `:id` param and sends a 404 with `generic.error-item-gone` if missing.
- **`@infrastructure/http/request`** – `tenantCallerContextOf` derives the tenant and caller identity from the request for scoping.
- **`@infrastructure/http/response`** – `successResponse` serializes the 200 body with a typed payload.
- **`../services` (index)** – `webhooksService.createSubscriptionSecret` performs the actual secret generation.
- **`../services/actions`** – `viewSubscription` shapes the subscription record for the given caller before it is included in the response.
- **`@types`** – `WebhookSubscriptionCreated` is the response payload type (subscription fields + `newSecret`).
- **`routes.ts`** – Registers this handler on the `POST /webhooks/subscriptions/:id/secrets` route.

## Notes

- The plaintext `newSecret` is returned **once**; it is not persisted in a retrievable form. The old secret continues to function until a separate `DELETE .../secrets/:secretId` call removes it.
- Error handling uses promise-chain (`.then`/`.catch`) rather than `async`/`await`, consistent with the `catchAs` helper's expectations.
- The `refused` check is a **service-level** rejection (e.g., permission or precondition failure) distinct from an exception; it is handled before the success path.
