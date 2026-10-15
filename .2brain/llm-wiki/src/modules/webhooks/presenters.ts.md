---
source: src/modules/webhooks/presenters.ts
sha256: cf3cb9e98b326eef2a919d5f0961ce78a9247369f648059c9dcdf0816937ba95
generated_at: 2026-10-15T12:19:46.049389+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/presenters.ts

## Purpose
Converts Mongoose webhook documents (subscription and delivery) into their wire-shape TypeScript types by delegating to each document's `.toJSON()` method. It exists so controllers have a single, consistent entry point for serializing domain objects before sending them over HTTP.

## Key elements
- **`presentWebhookSubscription(document: WebhookSubscriptionDocument): WebhookSubscription`** — Calls `document.toJSON()` and casts the result to the `WebhookSubscription` wire type.
- **`presentWebhookDelivery(document: WebhookDeliveryDocument): WebhookDelivery`** — Calls `document.toJSON()` and casts the result to the `WebhookDelivery` wire type.

Both are pure one-liners with no additional logic; all field mapping (e.g. `_id` → `id`) is handled by the model's `toJSON` override.

## Relationships
- **`src/modules/webhooks/model.ts`** — Source of the `WebhookSubscriptionDocument` and `WebhookDeliveryDocument` types that these functions accept. The model's `toJSON` implementation is what actually performs the field transforms.
- **`src/types/index.ts`** — Source of the `WebhookSubscription` and `WebhookDelivery` wire types that these functions return.
- **`controllers/create-subscription.ts`** and **`controllers/rotate-subscription-secret.ts`** — Call `presentWebhookSubscription`, then layer a one-time plaintext `secret` field on top of the result before responding.
- **`controllers/remove-subscription-secret.ts`**, **`controllers/update-subscription.ts`** — Use `presentWebhookSubscription` for their read/response path.
- **`controllers/replay-delivery.ts`** — Uses `presentWebhookDelivery` to serialize the delivery log entry in its response.

## Notes
- The `as` casts are safe by construction (`.toJSON()` is the model's contract for the wire shape), but they are type-level only—no runtime validation or defaulting happens here.
- When adding a new webhook-related endpoint, prefer these presenters over calling `.toJSON()` directly in the controller; it keeps the wire-shape mapping in one place.
- The only controller that deviates from "presenter output = response body" is `create-subscription` / `rotate-subscription-secret`, which append the plaintext secret after calling the presenter.
