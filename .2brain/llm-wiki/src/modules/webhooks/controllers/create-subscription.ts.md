---
source: src/modules/webhooks/controllers/create-subscription.ts
sha256: 06c68493a167539f66f8beb14930ec1bdb4a26e43df9d1f13cf1c2b8dac32494
generated_at: 2026-10-29T06:25:02.676248+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/create-subscription.ts

## Purpose

HTTP controller for `POST /webhooks/subscriptions`. Parses and validates the request body, resolves the tenant/caller context, delegates creation to the webhooks service, and returns a `201 Created` response containing the subscription view plus its one-time delivery `secret`.

## Key elements

- **`createWebhookSubscription`** (exported) — Express handler. Pipeline: `parseBody` → `tenantCallerContextOf` → `webhooksService.createSubscription` → `viewSubscription` → `createdResponse`. On any thrown error, `catchAs` maps it to an appropriate HTTP error response.

## Relationships

- **`src/infrastructure/http/controller.ts`** — supplies `parseBody`, `refused`, and `catchAs` utilities used for validation, service-result handling, and error mapping.
- **`src/infrastructure/http/request.ts`** — supplies `tenantCallerContextOf` to extract tenant and caller identity from the incoming request.
- **`src/infrastructure/http/response.ts`** — supplies `createdResponse`, which sets the `201` status, `Location` header, and JSON body.
- **`src/modules/webhooks/services/index.ts`** — re-exports `webhooksService`; this controller calls `webhooksService.createSubscription(body, context)`.
- **`src/modules/webhooks/services/actions.ts`** — supplies `viewSubscription`, which shapes the stored subscription into the caller-facing representation (hides internal fields).
- **`src/modules/webhooks/routes.ts`** — registers this handler on the `POST /webhooks/subscriptions` route.
- **`src/types/index.ts`** — provides `CreateWebhookSubscriptionRequest` (typed request body) and `WebhookSubscriptionCreated` (response payload shape).

## Notes

- The delivery `secret` is included **only** in the `201` creation response; it is not part of `viewSubscription` and is not retrievable afterwards.
- The `url` field is constrained to `https://` by the generated Zod schema at creation time, but is re-validated against the **resolved IP** on every subsequent delivery via the SSRF guard (`@infrastructure/adapters/ssrf-guard.ts`), since DNS can change post-creation.
- `parseBody` writes its own error response and returns `undefined` on failure; the handler does an early `return` in that case.
