---
source: src/modules/webhooks/presenters.ts
sha256: 9b8727b272322194d00c367ad32ccc69a63d64a5214924ef03b71159b2339115
generated_at: 2026-11-14T22:43:51.875588+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/presenters.ts

## Purpose

Transforms Mongoose documents for the two webhook resources (subscription and delivery) into their wire/API shapes. Each presenter applies the model's `toJSON()` transform (e.g. `_id` → `id`, ring collapse to `secretIds`, derived `enabled` field) and attaches the caller-supplied `actions` object, producing the shape the HTTP layer returns.

## Key elements

- **`presentWebhookSubscription(document, actions)`** — Spreads the subscription document's `toJSON()` output (typed as `StoredWebhookSubscription`), wraps it with `carryVersion`, and merges in `actions`. Returns a full `WebhookSubscription` wire object.
- **`presentWebhookDelivery(document, actions)`** — Spreads the delivery document's `toJSON()` output and merges in `actions`. Returns a full `WebhookDelivery` wire object.

## Relationships

- **`src/types/index.ts`** — Imports the wire-shape types (`WebhookSubscription`, `WebhookSubscriptionActions`, `WebhookDelivery`, `WebhookDeliveryActions`) that define each function's return and parameter contracts.
- **`src/infrastructure/persistence/versioning.ts`** — Imports `carryVersion`, which wraps the subscription spread with version metadata.
- **`src/modules/webhooks/model.ts`** — Imports `WebhookSubscriptionDocument` and `WebhookDeliveryDocument` (Mongoose schema instances) as the input types.
- **`src/modules/webhooks/repository.ts`** — Imports `StoredWebhookSubscription` for the type assertion on the subscription `toJSON()` result.
- **`src/modules/webhooks/services/actions.ts`** — The upstream source of the `actions` argument; presenters receive it already resolved and simply attach it.
- **`src/modules/webhooks/services/deliveries.ts`** — Likely caller of `presentWebhookDelivery` when reading delivery logs.

## Notes

- Both presenters cast the `toJSON()` result (`as StoredWebhookSubscription` / `as Omit<WebhookDelivery, 'actions'>`) because Mongoose types the return as a generic object. The cast is a compile-time bridge, not a runtime check.
- The module doc comment references `create`/`secrets` flows that layer a one-time plaintext secret on top of `presentWebhookSubscription`, but that logic lives outside this file (in the service/controller layer).
- No logic is conditional on the caller here; all transformation is delegated to the Mongoose schema's `toJSON` hooks. Adding or changing a wire field means editing the model's transform, not the presenter.
