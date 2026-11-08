---
source: src/modules/webhooks/controllers/post-subscription-enable.ts
sha256: 45958972b013d05728f30b1d7d3c0dc3b43e4dc4d263cf73bd41988fe6037518
generated_at: 2026-11-08T09:01:46.632912+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/post-subscription-enable.ts

## Purpose

HTTP controller handler for `POST /webhooks/subscriptions/:id/enable`. It validates the subscription ID, assembles a tenant caller context, delegates to the webhooks service to re-enable the subscription, and shapes the success or refusal response.

## Key elements

- **`enableWebhookSubscription`** (exported function) — Express route handler. Extracts the `:id` param, builds the caller context, calls `webhooksService.enableSubscription`, and returns either a `refused` (e.g. 409 if already enabled) or a `successResponse` containing the subscription view.

## Relationships

- **`src/infrastructure/http/ids.ts`** — `requireId` validates the `:id` route param and short-circuits with a 404 when missing.
- **`src/infrastructure/http/request.ts`** — `tenantCallerContextOf` derives the tenant + caller context from the incoming request.
- **`src/infrastructure/http/controller.ts`** — `refused` maps service-level rejection results to the appropriate HTTP error response; `catchAs` wraps unhandled promise rejections into a standard error response.
- **`src/infrastructure/http/response.ts`** — `successResponse` serialises the 200 body.
- **`src/modules/webhooks/services/index.ts`** — provides `webhooksService`, whose `enableSubscription` method performs the actual state transition.
- **`src/modules/webhooks/services/actions.ts`** — `viewSubscription` projects the full subscription entity into the public API shape for the caller.
- **`src/modules/webhooks/routes.ts`** — registers this handler on the `POST /webhooks/subscriptions/:id/enable` route.
- **`src/types/index.ts`** — supplies the `WebhookSubscription` type used in the response generic.

## Notes

- The 404 for a missing ID uses the generic `'generic.error-item-gone'` message rather than a webhook-specific one.
- The "already enabled → 409" logic lives in the service layer; the controller only translates the service's refusal via `refused`. The controller itself contains no conditional on subscription status.
