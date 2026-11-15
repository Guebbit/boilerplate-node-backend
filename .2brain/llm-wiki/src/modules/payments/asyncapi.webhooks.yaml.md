---
source: src/modules/payments/asyncapi.webhooks.yaml
sha256: 76e66b014b4c21625f5ca7e7742c2ab162245818ad08b65805c5d2e3f623e588
generated_at: 2026-11-14T20:58:47.029857+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/asyncapi.webhooks.yaml

## Purpose

Defines the AsyncAPI contract for the payments module's outbound webhook events (`payment.*`). It is a **fragment**, not a standalone document: it depends on `#/servers/subscriberEndpoint` and `#/components/schemas/WebhookHeaders` declared in the root `webhooks/asyncapi.yaml`, and is merged into the final contract only while the payments module is registered.

## Key elements

- **`channels`** — Seven event channels, each bound to `subscriberEndpoint` and carrying a single message:
  - `payment.succeeded` — a payment settled.
  - `payment.failed` — a payment attempt was declined.
  - `payment.refunded` — a refund settled (full or partial).
  - `payment.refund_failed` — the provider refused/failed a refund.
  - `payment.refund_reversed` — the provider clawed back a previously settled refund.
  - `payment.dispute_opened` — the buyer's bank opened a chargeback.
  - `payment.dispute_updated` — a known dispute's status changed.
- **`operations`** — One `send` operation per channel; each maps 1:1 to a domain event in `payments/events.ts` (or `payments/services/refunds.ts`).
- **`components.messages`** — Seven message objects (e.g. `PaymentSucceededEvent`), each with `WebhookHeaders` and a typed envelope payload.
- **`components.schemas`** — Payload schemas:
  - `PaymentEventPayload` — base `{ paymentId, orderId }`.
  - `PaymentRefundedPayload` — adds `refundId`, `amount`, `currency`.
  - `PaymentRefundReversedPayload` — adds `failureReason` (cross-refs `./openapi.yaml#/components/schemas/RefundFailureReason`).
  - `PaymentRefundFailedPayload` — adds `refund` details (truncated in listing).
  - (Dispute and other payload schemas follow the same pattern.)

## Relationships

- **`src/modules/orders/asyncapi.webhooks.yaml`** — Sibling fragment: both reference the same `subscriberEndpoint` and `WebhookHeaders` components from the root `webhooks/asyncapi.yaml` and are merged side-by-side by the bundler into the `webhooks` section. The `orderId` field present in every payment payload is the cross-module join key to the orders domain, allowing a subscriber to correlate `payment.*` and `order.*` events.

## Notes

- **Fragment, not document.** The file is invalid AsyncAPI on its own; it only resolves after the bundler (`scripts/contracts/asyncapi-section-fragments.ts`) injects the shared `servers` and `WebhookHeaders` from `webhooks/asyncapi.yaml`. Removing the payments module removes its events from the merged contract and from `GET /webhooks/events`.
- **Cross-file schema ref.** `PaymentRefundReversedPayload.failureReason` uses a relative `$ref` into `./openapi.yaml` (`RefundFailureReason`). The bundler copies that schema in, so the REST and event contracts share a single enum.
- **`x-read-rule: display:Payment`** on every channel is a convention for the event-listing UI to group events under the "Payment" read rule.
- **Firing semantics live in the operation descriptions**, not in the schema: e.g. `payment.refund_failed` fires once per *new* refusal (not per retry), and `payment.dispute_updated` drops stale/duplicate reports. These behavioral notes are the contract for subscribers.
- **Standard Webhooks envelope.** Every payload is wrapped in `{ type, timestamp, data }` by the module's `publicEvents` (`module.ts`); the schemas here describe only the `data` portion.
