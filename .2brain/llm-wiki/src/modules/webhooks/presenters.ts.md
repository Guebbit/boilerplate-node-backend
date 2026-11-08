---
source: src/modules/webhooks/presenters.ts
sha256: 65d2fa2185ecc1b054e4facba288d12b2b52e006097a26675781dd039189f035
generated_at: 2026-11-08T09:04:14.894124+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/presenters.ts

## Purpose

Turns stored webhook documents into their wire (API response) shapes. Two presenters exist—one per resource (subscription and delivery log)—because webhooks serves both. The presenters apply the model's `.toJSON()` transform and attach caller-scoped `actions`; they do not compute secrets or otherwise enrich the payload beyond what the document already carries.

## Key elements

- **`presentWebhookSubscription(document, actions)`** – Spreads `document.toJSON()` (which maps `_id`→`id`, collapses the secret ring into `secretIds`, and derives `enabled`) and appends the pre-built `actions` object. Returns a `WebhookSubscription`.
- **`presentWebhookDelivery(document, actions)`** – Spreads `document.toJSON()` (which maps `_id`→`id`) and appends `actions`. Returns a `WebhookDelivery`.

## Relationships

- **`src/modules/webhooks/model.ts`** – Supplies `WebhookSubscriptionDocument` and `WebhookDeliveryDocument`; the `.toJSON()` method invoked here is defined on those model classes.
- **`src/modules/webhooks/repository.ts`** – Exports `StoredWebhookSubscription`, used as the cast target for the subscription spread to satisfy TypeScript.
- **`src/modules/webhooks/services/actions.ts`** – Produces the `WebhookSubscriptionActions` / `WebhookDeliveryActions` objects that callers pass into these presenters (the "finished" actions noted in the docs).
- **`src/modules/webhooks/services/deliveries.ts`** – Consumes `presentWebhookDelivery` when building delivery-log responses.
- **`src/types/index.ts`** – Declares the wire types (`WebhookSubscription`, `WebhookDelivery`, and their action counterparts) used as return types and parameter types.

## Notes

- The module doc states that `create` and `secrets` operations layer a one-time plaintext secret *on top of* `presentWebhookSubscription`—callers doing that must merge the extra field after the presenter returns; the presenter itself never touches secrets.
- Both functions include a cast (`as StoredWebhookSubscription` / `as Omit<WebhookDelivery, 'actions'>`) to bridge the stored-document type to the wire type. The cast is safe only because `.toJSON()` guarantees the expected shape; if the model's transform changes, the cast will silently mask the mismatch.
- `actions` is always the last property in the spread, so it cannot be accidentally overridden by a key that `.toJSON()` emits.
