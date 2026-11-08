---
source: src/modules/webhooks/controllers/post-subscription-disable.ts
sha256: 0b65fe7163f1b6a7553bfaded81c78e7d25786cccc53aede8b18e0e2131e3c72
generated_at: 2026-11-08T09:01:37.640063+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/post-subscription-disable.ts

## Purpose

HTTP controller for `POST /webhooks/subscriptions/:id/disable`. It validates the subscription ID, delegates to the webhooks service to pause (disable) the subscription, and returns the resulting subscription view — or a 409 if it is already paused.

## Key elements

- **`disableWebhookSubscription`** (exported) — The Express handler. Extracts and validates the `:id` param, builds a tenant caller context, calls `webhooksService.disableSubscription`, and responds with `successResponse` containing the transformed subscription, or a 409/refused response if the subscription is already in the desired state.

## Relationships

- **`@infrastructure/http/controller`** — Uses `catchAs` for error translation and `refused` to short-circuit on conflict (409).
- **`@infrastructure/http/ids`** — `requireId` extracts and validates the `:id` route param, emitting a 404 with `generic.error-item-gone` if missing/invalid.
- **`@infrastructure/http/request`** — `tenantCallerContextOf` derives the tenant + caller context from the incoming request.
- **`@infrastructure/http/response`** — `successResponse` formats the JSON success envelope.
- **`../services/index`** (`webhooksService`) — Provides the `disableSubscription` domain operation.
- **`../services/actions`** — `viewSubscription` shapes the raw subscription into the API response view.
- **`@types`** — `WebhookSubscription` type used in the response generic.
- **`src/modules/webhooks/routes.ts`** — Registers this controller on the `POST /webhooks/subscriptions/:id/disable` route.

## Notes

- The 409 path is *not* thrown as an error; `refused` inspects the service result and, if it signals a no-op conflict, sends the response and returns early. The caller must respect this.
- The success payload is the *view* (`viewSubscription`), not the raw entity — fields visible depend on `context.caller` role.
- The `catchAs` label `'disableWebhookSubscription'` is the stable identifier used by the error-translation layer; changing it breaks correlation with logged/translated errors.
