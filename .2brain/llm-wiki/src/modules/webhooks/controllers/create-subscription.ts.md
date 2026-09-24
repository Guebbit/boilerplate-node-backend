---
source: src/modules/webhooks/controllers/create-subscription.ts
sha256: ecb7961781440313b6b953ec1fd17fe21a2b48d0b9a32e5c89f04fb62a89c359
generated_at: 2026-09-23T19:38:30.398998+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/create-subscription.ts

## Purpose
HTTP controller that handles `POST /webhooks/subscriptions`. It parses and validates the request body against the generated Zod schema, delegates to the webhooks service to create the subscription, and returns the new subscription along with its one-time `secret`.

## Key elements
- **`createWebhookSubscription`** (exported) – Express route handler. Calls `parseBody` with `CreateWebhookSubscriptionBody` (from `@api/schemas.zod`), then `webhooksService.createSubscription(body, tenantCallerContextOf(request))`. On success responds `201` with the subscription JSON spread together with the `secret` (available only at creation time). On failure routes through `refused` / `catchAs`.

## Relationships
- **`src/infrastructure/http/controller.ts`** – Provides `parseBody`, `refused`, and `catchAs` used for body validation, domain-rejection short-circuiting, and error mapping.
- **`src/infrastructure/http/request.ts`** – Provides `tenantCallerContextOf` to extract tenant identity for the service call.
- **`src/infrastructure/http/response.ts`** – Provides `successResponse` for the `201` reply.
- **`src/modules/webhooks/services/index.ts`** – Exposes `webhooksService`; the controller calls `.createSubscription()` on it.
- **`src/modules/webhooks/routes.ts`** – Registers this handler on the `POST /webhooks/subscriptions` path.
- **`src/types/index.ts`** – Supplies the `CreateWebhookSubscriptionRequest` and `WebhookSubscriptionCreated` type aliases used for typing the handler signature and response body.

## Notes
- **Secret is returned only here.** The `secret` is part of the `201` response body but is not persisted on the subscription object itself; it cannot be retrieved after creation.
- **URL SSRF re-validation is deferred.** The `url` field is checked for `https://` at request time via the Zod schema pattern, but the actual SSRF guard (resolving DNS and rejecting private/link-local IPs) runs on *every delivery*, not at subscription time, because DNS can change post-creation. See `@infrastructure/adapters/ssrf-guard.ts`.
- **Zod schema is generated.** `CreateWebhookSubscriptionBody` comes from `@api/schemas.zod` (generated from `openapi.yaml`); don't edit it by hand.
