---
source: src/modules/webhooks/asyncapi.yaml
sha256: ff5eb7e0c614511f32526b1020bc865f0342a286134eb97de1db0878e230f511
generated_at: 2026-09-27T15:40:39.806300+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/asyncapi.yaml

## Purpose

The public AsyncAPI 3.0.0 event catalogue for the webhooks module. It is the single source of truth for which events a webhook subscriber can receive, what their payloads look like, and which Standard Webhooks headers accompany every delivery. Served verbatim by `GET /webhooks/events`, it guarantees the catalogue a subscriber reads can never drift from the events the module actually fires.

## Key elements

- **`servers.subscriberEndpoint`** — A variable (template) server using `{subscriberHost}` / `{subscriberPath}`. Not a fixed host: each subscription supplies its own HTTPS URL at runtime.
- **`channels`** (6): `order.created`, `order.paid`, `order.shipped`, `order.cancelled`, `payment.succeeded`, `payment.failed`. Each binds to `subscriberEndpoint` and references one message.
- **`operations`** (6): One `send` operation per channel, with prose noting which domain event (or filtered `order.status_changed`) fires it.
- **`components.messages`** — Six message objects, each pairing `WebhookHeaders` with a per-event envelope schema.
- **`components.schemas.WebhookHeaders`** — The three Standard Webhooks headers (`webhook-id`, `webhook-timestamp`, `webhook-signature`) required on every delivery.
- **`components.schemas.OrderIdPayload` / `OrderCancelledPayload` / `PaymentEventPayload`** — The `data` field shapes for each event family.
- **Envelope convention** — Every body is `{ type, timestamp, data }`; `type` identifies the event, `timestamp` is the occurrence time (stable across retries), `data` is the payload above.

## Relationships

- **`scripts/contracts/asyncapi-bundles.ts`** — This file is a `shared` section in the bundler's merge. It is merged into both `asyncapi.yaml` and `asyncapi.public.yaml`. The bundler enforces that each section is a complete, standalone-valid AsyncAPI document and refuses two sections declaring the same key (`mergeInto`).
- **`asyncapi.public.yaml`** — Output artifact: this file's contents appear in the public bundle after the bundler merge.
- **`src/modules/webhooks/asyncapi.internal.yaml`** — Sibling section in the same module but `private` scope; owns the `worker.webhook.deliver` queue. The shared/private split is deliberate: the internal queue is backend-only and must never appear in the public catalogue.
- **`src/modules/webhooks/module.ts`** — Its `onRegistered` hook subscribes generically to every domain event whose module manifest declares a `publicEvents` entry (`kernel/registry.ts` → `PublicEventTarget`) and republishes matched events (signed, filtered) to the subscriber URL. This file does not import event constants from `orders` or `payments`; the mapping lives in their respective `module.ts` files.

## Notes

- **Authored, not generated.** The six channel names are a worked example. Removing `orders`/`payments` from a deployment means hand-deleting the corresponding channels here and their `publicEvents` declarations in those modules' manifests. There is no code that auto-trims this file.
- **Channel catalogue is intentionally monolithic.** Splitting channels into per-owning-module files is a follow-up decision, not the current design. The reason: every channel `$ref`s the single `subscriberEndpoint` server and the single `WebhookHeaders` schema, and the bundler requires each section to be independently valid — a `$ref` to a server or schema not declared in the same section fails `lint:asyncapi:modules`.
- **`webhook-id` is not repeated in the body.** The delivery id lives only in the `webhook-id` header; subscribers deduplicate on that header, not a body field.
- **`order.paid` and `order.shipped` are derived events.** They are filtered projections of `order.status_changed` (matching `to: 'paid'` / `to: 'shipped'`), not one-to-one domain events. See `orders/events.ts` for the filtering logic.
- **`payment.failed` can fire multiple times for the same order** (retryable with another payment method); `payment.succeeded` does not.
