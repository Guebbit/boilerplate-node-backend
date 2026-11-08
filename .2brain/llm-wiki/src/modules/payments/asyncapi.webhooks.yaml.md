---
source: src/modules/payments/asyncapi.webhooks.yaml
sha256: c2067a7cda6178ef9ae85440573c93c67404b7bd184f6d910b62f947cda8885d
generated_at: 2026-11-08T07:16:03.864686+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/asyncapi.webhooks.yaml

## Purpose

AsyncAPI **fragment** (not a standalone document) that declares the seven `payment.*` webhook channels, their send operations, and the message/payload schemas the payments module publishes. It is merged into the top-level `webhooks/asyncapi.yaml` by the contract bundler and is only visible in `GET /webhooks/events` while the payments module is registered.

## Key elements

- **`channels/`** — Seven event channels, each bound to `#/servers/subscriberEndpoint` and carrying a single message:
  - `payment.succeeded` — payment settled.
  - `payment.failed` — attempt declined (can fire more than once per order).
  - `payment.refunded` — a refund settled (full or partial; may re-fire after a reversal).
  - `payment.refund_failed` — provider refused/failed a refund; `final` flag distinguishes terminal from retryable.
  - `payment.refund_reversed` — provider clawed back a previously settled refund.
  - `payment.dispute_opened` — buyer's bank opened a chargeback (once per dispute).
  - `payment.dispute_updated` — state change on a known dispute (older/duplicate reports are dropped).

- **`operations/`** — One `send` operation per channel (`webhookPayment*`), each referencing its channel and message. Descriptions note the one-to-one mapping to domain events in `payments/events.ts` and `payments/services/refunds.ts`.

- **`components.messages`** — Seven `Payment*Event` message definitions, each wrapping `#/components/schemas/WebhookHeaders` and a typed payload envelope.

- **`components.schemas`** — Payload schemas (`PaymentEventPayload`, `PaymentRefundedPayload`, `PaymentRefundReversedPayload`, `PaymentRefundFailedPayload`, …). All use `additionalProperties: false` and `$ref` shared types (`Id`, `NonNegativeDecimalAmount`, `CurrencyCode`) or cross-reference `./openapi.yaml` (e.g. `RefundFailureReason`).

## Relationships

- **`src/modules/orders/asyncapi.webhooks.yaml`** — Sibling fragment in the same pattern: each module ships its own `asyncapi.webhooks.yaml` fragment; the bundler (`scripts/contracts/asyncapi-section-fragments.ts`) merges all registered module fragments into the single `webhooks/asyncapi.yaml` document. The two files do not reference each other directly but share the same structural contract (channels → operations → messages → schemas) and the same top-level `#/servers/subscriberEndpoint` and `#/components/schemas/WebhookHeaders`.

- **`webhooks/asyncapi.yaml`** (not a graph neighbor, but the merge target) — Declares the `servers`, `WebhookHeaders`, `Id`, `NonNegativeDecimalAmount`, `CurrencyCode`, and `*Envelope` schemas that this fragment `$ref`s. Without it this file is unresolvable.

- **`./openapi.yaml`** (same module) — Source of REST-facing schemas (e.g. `RefundFailureReason`) that the bundler copies into the webhook contract so the REST and event payloads share one definition.

- **`module.ts` / `publicEvents`** (same module) — The runtime array that actually emits these events; the YAML is the static contract mirror.

## Notes

- **Fragment, not document.** The file has no `asyncapi:` version header and no `info:` block; it will not validate standalone. It resolves `#/servers/…` and `#/components/schemas/WebhookHeaders` only after the bundler splices it into the parent document.
- **Deletion is atomic.** Removing the payments module removes both the runtime emitter and the contract entry simultaneously; there is no orphaned channel left in the published spec.
- **`payment.failed` can repeat.** Because a declined payment is retryable with another method, the same `orderId` may appear in multiple `payment.failed` deliveries.
- **`payment.refunded` vs `payment.refund_reversed`.** A reversed refund does *not* cancel the credit note issued at settlement; it signals the obligation is owed again. A subsequent re-settlement re-fires `payment.refunded` with the same `refundId`.
- **Disputes are not refunds.** `payment.dispute_opened` explicitly states no refund or credit note follows; resolution happens in the provider's dashboard.
- **Cross-file schema coupling.** `failureReason` in refund-related payloads `$ref`s `./openapi.yaml#/components/schemas/RefundFailureReason`. Editing that enum in the REST contract changes the webhook payload shape automatically (bundler copies it in), but the reverse is not true.
