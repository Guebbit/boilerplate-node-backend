---
source: src/modules/webhooks/controllers/update-subscription.ts
sha256: 381f9138269149ac3dcd871d232f51be8b3c085b0e84db0162dc741b7aba42cd
generated_at: 2026-11-14T22:42:45.372703+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/controllers/update-subscription.ts

## Purpose

Builds the `PUT /webhooks/subscriptions/:id` (full replace) and `PATCH /webhooks/subscriptions/:id` (partial merge) handlers for webhook subscriptions. Both verbs share a single `createUpdateController` factory call; neither touches the secret ring or the enabled/disabled flag (those live on dedicated action routes).

## Key elements

- **`replaceWebhookSubscription`** – Exported PUT handler; accepts a `ReplaceWebhookSubscriptionBody` and fully replaces the subscription fields.
- **`updateWebhookSubscription`** – Exported PATCH handler; accepts an `UpdateWebhookSubscriptionBody` and merges the supplied changes.
- **`createUpdateController({...})`** – Factory call that produces both handlers. Configured with `versioned: true`, entity `'webhookSubscription'`, Zod schemas for each verb, and a 404 key `'generic.error-item-gone'`.
- **`update` callback** – Delegates to `webhooksService.updateSubscription(id, changes, tenantCallerContextOf(request))`.
- **`present` callback** – Shapes the response via `viewSubscription(subscription, tenantCallerContextOf(request).caller)`.

## Relationships

- **`src/infrastructure/surfaces/create-update-controller.ts`** – Supplies the `createUpdateController` factory that assembles the PUT/PATCH pair, handles versioning, 404 responses, and schema validation around the `update`/`present` callbacks.
- **`src/infrastructure/http/request.ts`** – Provides `tenantCallerContextOf`, used to extract the tenant-scoped caller context passed into both the service call and the view function.
- **`src/modules/webhooks/services/index.ts`** – Exposes `webhooksService`, whose `updateSubscription` method performs the actual persistence.
- **`src/modules/webhooks/services/actions.ts`** – Exposes `viewSubscription`, the projection/serialization helper for the response body.
- **`src/modules/webhooks/routes.ts`** – Wires `replaceWebhookSubscription` and `updateWebhookSubscription` onto the corresponding `PUT`/`PATCH` route entries.

## Notes

- Secret rotation, secret removal, enable, and disable are intentionally **not** reachable through these two verbs; they have their own controllers and routes.
- `tenantCallerContextOf` is invoked separately in both the `update` and `present` callbacks—there is no shared context variable hoisted out of the factory config.
- The destructuring `const { replace, update } = createUpdateController(...)` is the project's convention for naming the two generated handlers from the factory.
