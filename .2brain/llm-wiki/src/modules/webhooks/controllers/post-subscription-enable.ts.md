---
source: src/modules/webhooks/controllers/post-subscription-enable.ts
sha256: b2a48e12ff38491ab958fafab7c53c5a11157d9838e37c6a2e54f4dbe9de6a26
generated_at: 2026-11-14T22:41:48.158682+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/post-subscription-enable.ts

## Purpose

Controller handler for `POST /webhooks/subscriptions/:id/enable`. Re-enables a previously disabled webhook subscription (from either "off" state). Returns **409** if the subscription is already active.

## Key elements

- **`enableWebhookSubscription`** (sole export) — Express handler that:
  1. Extracts and validates the `:id` param via `requireId`.
  2. Derives the tenant/caller context from the request.
  3. Delegates to `webhooksService.enableSubscription(id, context)`.
  4. Maps the returned record through `viewSubscription` to the API view model.
  5. Responds with `successResponse`, setting the resource representation per RFC 9110 §8.8.3.
  6. Catches and maps unexpected errors via `catchAs`.

## Relationships

- **`src/modules/webhooks/services/index.ts`** — imports `webhooksService`; calls its `enableSubscription` method.
- **`src/modules/webhooks/services/actions.ts`** — imports `viewSubscription` to shape the raw data into the public `WebhookSubscription` view.
- **`src/infrastructure/http/controller.ts`** — imports `refused` (detects the 409 "already enabled" result) and `catchAs` (wraps the `.catch` handler).
- **`src/infrastructure/http/ids.ts`** — imports `requireId` to pull and validate the `:id` route parameter.
- **`src/infrastructure/http/request.ts`** — imports `tenantCallerContextOf` to build the scoped execution context.
- **`src/infrastructure/http/preconditions.ts`** — imports `answerAsResource` to set the ETag / resource link on the response.
- **`src/infrastructure/http/response.ts`** — imports `successResponse` for the final 200 body.
- **`src/types/index.ts`** — imports the `WebhookSubscription` type used in the response generic.
- **`src/modules/webhooks/routes.ts`** — registers this handler on the `POST /webhooks/subscriptions/:id/enable` route.

## Notes

- "Either kind of off" (per the doc comment) implies two distinct disabled states (e.g. paused vs. hard-disabled); the endpoint treats both identically for re-enablement.
- `refused(response, result)` is called **before** any further work; it both inspects the service result and writes the 409 response, short-circuiting the `.then` chain.
- The `notFound` token passed to `requireId` is the string `'generic.error-item-gone'`, a project-wide error-code convention rather than a raw message.
- File is a `@module` (no default export); only the single named function is public.
