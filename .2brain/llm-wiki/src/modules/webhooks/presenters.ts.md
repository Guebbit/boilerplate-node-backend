---
source: src/modules/webhooks/presenters.ts
sha256: 65d2fa2185ecc1b054e4facba288d12b2b52e006097a26675781dd039189f035
generated_at: 2026-10-29T06:28:17.668415+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/presenters.ts

## Purpose

Transforms stored webhook documents into their wire (API response) shapes. Webhooks serves two resource types—a subscription and its delivery log—and this file provides one presenter per resource. It is the single place where a `*Document` becomes a `*Subscription` or `*Delivery` wire type, keeping that mapping out of the service layer.

## Key elements

- **`presentWebhookSubscription(document, actions)`** — Calls `document.toJSON()` (which applies the model's `_id → id`, ring → `secretIds`, and derived `enabled` transforms), casts the result to `StoredWebhookSubscription`, and attaches the caller-supplied `actions`. Returns a `WebhookSubscription`.
- **`presentWebhookDelivery(document, actions)`** — Same pattern: `.toJSON()` (only `_id → id`), cast, attach `actions`. Returns a `WebhookDelivery`.

Both functions are pure mappers—no I/O, no mutation. The `actions` parameter is expected to arrive already computed by the service layer.

## Relationships

- **`src/types/index.ts`** — Source of the wire types (`WebhookSubscription`, `WebhookSubscriptionActions`, `WebhookDelivery`, `WebhookDeliveryActions`) and the input/output contracts for both presenters.
- **`src/modules/webhooks/model.ts`** — Source of `WebhookSubscriptionDocument` and `WebhookDeliveryDocument`; their `.toJSON()` methods perform the actual field-level transforms that the presenters rely on.
- **`src/modules/webhooks/repository.ts`** — Supplies `StoredWebhookSubscription`, the intermediate type used in the cast inside `presentWebhookSubscription` to bridge the document's stored shape to the wire shape.
- **`src/modules/webhooks/services/actions.ts`** — Produces the `actions` objects passed into both presenters (referenced in doc comments; the presenters do not import it).

## Notes

- The `as StoredWebhookSubscription` cast in `presentWebhookSubscription` is a type-level assertion that `.toJSON()`'s output satisfies the wire shape. At runtime the cast is a no-op; if the model's transform changes, this cast will silently mask the mismatch.
- The module doc comment notes that `create` and `secrets` endpoints layer a one-time plaintext secret **on top of** `presentWebhookSubscription`—the secret is not part of this file's output.
- The delivery presenter casts to `Omit<WebhookDelivery, 'actions'>` rather than a separate stored type, since there is no `StoredWebhookDelivery` analogue in the repository.
