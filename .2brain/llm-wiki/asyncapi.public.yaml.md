---
source: asyncapi.public.yaml
sha256: 6d527215c72c0ae4ef661bdc83a9f0a13ba26fc2f60805ec838fb21782bc1b98
generated_at: 2026-09-23T17:11:13.385984+00:00
model: ollama:qwen3.8:27b
---

# asyncapi.public.yaml

## Purpose

A **generated, read-only** AsyncAPI 3.0.0 contract document that describes all real-time/event-driven channels (SSE observability streams and outbound webhook deliveries) exposed by this backend. It is produced by `npm run contracts:bundle` from the three source YAML files listed in its header. It exists so external consumers, Spectral rules, and CI breaking-change gates have a single canonical artifact to validate against, without needing to resolve cross-file `$ref`s themselves.

## Key elements

- **`asyncapi: 3.0.0` / `info.version: 2.0.0`** — Spec version is 3.0.0; the *info* version (2.0.0) marks a deliberate breaking change to the Standard Webhooks envelope shape. The `check:asyncapi-breaking` gate compares the *spec* version, not this field.
- **`servers`** — Two entries: `sseLocal` (the app's own HTTP server for the SSE endpoint) and `subscriberEndpoint` (a variable placeholder for the *subscriber's* HTTPS URL; this is an outbound connection, not one the app listens on).
- **`channels`** — Nine channel addresses: three observability SSE channels (`observability.metrics.snapshot`, `.updated`, `.heartbeat`) and six webhook channels (`order.created|paid|shipped|cancelled`, `payment.succeeded|failed`). Webhook channels bind to `subscriberEndpoint`; SSE channels bind to `sseLocal`.
- **`operations`** — One `send` operation per channel, each carrying a description of when and why the event fires (e.g., `webhookOrderPaid` is derived from `order.status_changed` filtered on `to: 'paid'`, not a standalone domain event).
- **`components.messages`** — One message per channel. Webhook messages carry `headers: WebhookHeaders` (signed headers) plus a typed payload envelope; SSE messages carry only a payload.
- **`components.schemas`** — Reusable schemas including `ObservabilityMetricsPayload`, `WebhookHeaders`, and per-event envelope schemas (e.g., `OrderCreatedEnvelope`).

## Relationships

- **`shared/contracts/asyncapi.root.yaml`**, **`src/modules/observability/asyncapi.yaml`**, **`src/modules/webhooks/asyncapi.yaml`** — These three files are the *sources* that `npm run contracts:bundle` merges into this file. Edit them, not this file.
- **`src/modules/orders/events.ts`** — Emits the domain events (`order.status_changed`, `order.cancelled`) that the `order.*` webhook operations describe. The `paid`/`shipped` webhooks are filtered views of `order.status_changed`, not independent events.
- **`src/modules/orders/services/crud.ts`** — `recordCreated` is the call-site that fires `order.created`, as noted in the `webhookOrderCreated` operation description.
- **`src/modules/payments/events.ts`** — Emits `payment.succeeded` / `payment.failed`, the one-to-one domain events behind the `payment.*` webhook operations.
- **`src/transport/webhook-signing.ts`** — Implements the signed-headers scheme described by the `WebhookHeaders` schema attached to every webhook message.
- **`CLAUDE.md` / `README.md`** — Reference this file as the canonical AsyncAPI contract for the project.

## Notes

- **Do not edit.** The header comment is explicit; changes must go through the three source YAMLs and then be re-bundled.
- **`info.version` vs `asyncapi` spec version.** The 2.0.0 in `info.version` documents a human-readable breaking change (new envelope shape). It does *not* suppress or satisfy the `check:asyncapi-breaking` CI gate, which compares the `asyncapi:` spec field (3.0.0) against `origin/main`. Expect that gate to flag real changes until this branch is merged.
- **`subscriberEndpoint` is not a server the app runs.** It is an outbound destination. Spectral's `asyncapi-servers` / `asyncapi-channel-servers` rules still pass because each webhook channel explicitly `$ref`s this server entry.
- **`order.paid` and `order.shipped` are derived, not emitted directly.** They filter `order.status_changed` on the `to` field. There is no separate `paid`/`shipped` domain event in `orders/events.ts`.
- **`payment.failed` can fire more than once per order** if the subscriber retries with a different method; it is not idempotent by order ID alone.
