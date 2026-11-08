---
source: src/modules/webhooks/controllers/delete-subscription-secret.ts
sha256: c51a8ff510987ca5620bc734f566721e84c47e2126363ed2646d168f4dde9393
generated_at: 2026-11-08T09:00:27.388375+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/delete-subscription-secret.ts

## Purpose

Controller for `DELETE /webhooks/subscriptions/:id/secrets/:secretId`. Removes a single secret (ring entry) from a webhook subscription as part of a key-rotation workflow. It delegates the actual removal to the service layer and shapes the success response into a subscription view.

## Key elements

- **`deleteWebhookSubscriptionSecret`** (exported) — The Express handler. Validates the `:id` param via `requireId`, builds a tenant caller context, calls `webhooksService.removeSubscriptionSecret`, then returns the updated subscription through `viewSubscription` wrapped in `successResponse`. Propagates rejection via `refused` and unexpected errors via `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Provides `catchAs` (error→HTTP mapping) and `refused` (service rejection→422 pass-through).
- **`src/infrastructure/http/ids.ts`** — Provides `requireId` for `:id` param validation with a 404 fallback message.
- **`src/infrastructure/http/request.ts`** — Provides `tenantCallerContextOf` to extract the caller/tenant context from the request.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` to serialise the 200 reply.
- **`src/modules/webhooks/services/index.ts`** — Source of `webhooksService`, whose `removeSubscriptionSecret` method performs the actual ring-entry deletion.
- **`src/modules/webhooks/services/actions.ts`** — Provides `viewSubscription`, the projection function that converts the raw subscription into the API-visible shape.
- **`src/types/index.ts`** — Source of the `WebhookSubscription` type used in the response generic.
- **`src/modules/webhooks/routes.ts`** — The route table that wires this controller to the `DELETE /webhooks/subscriptions/:id/secrets/:secretId` path.

## Notes

- The 422 "ring would become empty" guard is enforced inside the service (`removeSubscriptionSecret`); this controller simply forwards the rejection via `refused`. No ring-emptiness logic lives here.
- The doc comment frames this as "the other half of a rotation": the subscription keeps a *ring* of secrets, and this endpoint removes one entry. It is not the same as deleting the subscription itself.
- The `:id` is validated with `requireId` (404 on miss), but `:secretId` is passed straight to the service without a local existence check — the 404 for an unknown `secretId` also comes from the service layer.
