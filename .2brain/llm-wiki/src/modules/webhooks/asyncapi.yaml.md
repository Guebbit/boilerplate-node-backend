---
source: src/modules/webhooks/asyncapi.yaml
sha256: ba0b735cefed259355bda2065a4a98e7329f38def0ad2c33ed84bc26f901ffd7
generated_at: 2026-09-23T19:38:01.108988+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/asyncapi.yaml

## Purpose

The public event catalogue for the webhooks module: a self-contained AsyncAPI 3.0.0 document that defines exactly which events a webhook subscriber can receive. It is the single source of truth served by `GET /webhooks/events`, so the catalogue a subscriber reads and the events the module actually fires cannot drift apart.

## Key elements

- **`servers.subscriberEndpoint`** — A variable (placeholder) server representing the subscriber's configured HTTPS URL; not a host this application runs.
- **`channels`** — Six event addresses: `order.created`, `order.paid`, `order.shipped`, `order.cancelled`, `payment.succeeded`, `payment.failed`.
- **`operations`** — Six `send` operations, one per channel, documenting the triggering condition (e.g. `order.paid` is derived from `order.status_changed` filtered to `to: 'paid'`).
- **`components.messages.*`** — Six message definitions, each pairing `WebhookHeaders` with a per-event envelope schema.
- **`components.schemas.WebhookHeaders`** — The three Standard Webhooks headers: `webhook-id`, `webhook-timestamp`, `webhook-signature`.
- **`components.schemas.OrderCreatedEnvelope` / `OrderPaidEnvelope` / `OrderShippedEnvelope` / `OrderCancelledEnvelope` / `PaymentSucceededEnvelope` / `PaymentFailedEnvelope`** — The Standard Webhooks body shape `{ type, timestamp, data }` with event-specific `data` payloads (`OrderIdPayload`, `OrderCancelledPayload`, `PaymentEventPayload`).

## Relationships

- **`scripts/contracts/asyncapi-bundles.ts`** — Merges this file (classified as `shared`) into both the full `asyncapi.yaml` and `asyncapi.public.yaml`.
- **`src/modules/webhooks/asyncapi.internal.yaml`** — Sibling file owning the private `worker.webhook.deliver` queue; explicitly excluded from this file's `shared` scope.
- **`src/modules/webhooks/module.ts`** — Subscribes to the domain events and republishes matching ones to subscriber URLs; also serves this file verbatim on `GET /webhooks/events`.
- **`orders/events.ts`** / **`payments/events.ts`** — Define the domain events (`order.created`, `order.status_changed`, `order.cancelled`, `payment.succeeded`, `payment.failed`) that `module.ts` listens for on the kernel event bus.
- **`transport/webhook-signing.ts`** — Generates the `webhook-id`, `webhook-timestamp`, and `webhook-signature` headers documented in `WebhookHeaders`.

## Notes

- `order.paid` and `order.shipped` are **derived** from the single `order.status_changed` event filtered by `to`; they are not independent domain events.
- `payment.failed` can fire **more than once** for the same order (a declined payment is retryable with another method).
- The `timestamp` in the envelope body is when the underlying event occurred (stable across retries); the `webhook-timestamp` header is when the signing attempt was made.
- `webhook-id` is shared across all fan-out subscriptions and all retries of one delivery; it is **not** repeated in the body.
- The six events listed are the reference shop's worked example. A deployment without orders declares its own events here and deletes this file along with the rest of the module.
