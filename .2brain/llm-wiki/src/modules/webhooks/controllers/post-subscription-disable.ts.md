---
source: src/modules/webhooks/controllers/post-subscription-disable.ts
sha256: 65ebe3521f3108a2f1e5e37da3a6afbd602bcb26cf129743fbc9d58716a8893a
generated_at: 2026-11-14T22:41:31.480571+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/post-subscription-disable.ts

## Purpose

Controller handler for `POST /webhooks/subscriptions/:id/disable`. Extracts the subscription ID and tenant context from the request, delegates to the webhooks service to pause the subscription, and formats the response as an RFC 9110 §8.8.3 resource (with ETag and Link). Returns 409 Conflict if the subscription is already paused.

## Key elements

- **`disableWebhookSubscription(request, response)`** — The sole export. Validates the route param `:id` (404 with `generic.error-item-gone` if missing), builds the tenant caller context, calls `webhooksService.disableSubscription`, checks for a refused (409) result, maps the returned data through `viewSubscription`, and sends a success response with resource headers.

## Relationships

- **`src/modules/webhooks/services/index.ts`** — Imports `webhooksService`; calls its `disableSubscription(id, context)` method.
- **`src/modules/webhooks/services/actions.ts`** — Imports `viewSubscription`, which transforms the raw service result into the caller-facing subscription shape.
- **`src/infrastructure/http/ids.ts`** — Uses `requireId` to safely extract and validate the `:id` route param.
- **`src/infrastructure/http/request.ts`** — Uses `tenantCallerContextOf` to derive the multi-tenant caller context from the request.
- **`src/infrastructure/http/controller.ts`** — Uses `refused` (409 short-circuit) and `catchAs` (uniform error handler tagged with `'disableWebhookSubscription'`).
- **`src/infrastructure/http/preconditions.ts`** — Uses `answerAsResource` to set ETag and `Link` headers before sending the body.
- **`src/infrastructure/http/response.ts`** — Uses `successResponse` to serialize the final JSON body.
- **`src/types/index.ts`** — Types the response payload as `WebhookSubscription`.
- **`src/modules/webhooks/routes.ts`** — Registers this handler at the `POST /webhooks/subscriptions/:id/disable` path (implied by the controller's module doc comment).

## Notes

- The "already paused" case is surfaced as a 409 via the `refused` guard, not an exception — the service signals this through the result shape rather than throwing.
- `answerAsResource` is called **before** `successResponse`; it sets headers (ETag from the subscription's tag, `Link` pointing to `/webhooks/subscriptions/${id}`), while `successResponse` writes the body. Order matters.
- The `catchAs` tag `'disableWebhookSubscription'` is used for error-log correlation; keep it in sync if the function is renamed.
