---
source: asyncapi.yaml
sha256: 7c4426a74a23944d62d4ba44fd6ba16ab08455dfe722904acf02da936b6180c5
generated_at: 2026-09-23T17:11:26.281484+00:00
model: ollama:qwen3.8:27b
---

# asyncapi.yaml

## Purpose

Generated AsyncAPI 3.0.0 contract document that is the single bundled output of `npm run contracts:bundle`. It merges five source YAML files (root, observability, webhooks, webhooks-internal, workers) into one spec describing every event-driven channel, message, and operation in the backend. Consumers (SSE dashboards, webhook subscribers, RabbitMQ workers) and AI assistants read this file to understand what flows exist without tracing individual module sources.

## Key elements

- **`info.version: 2.0.0`** – Documents the Standard Webhooks envelope change (`{ type, timestamp, data }` + signed headers) as a deliberate breaking shift. This field is human-facing; the `check:asyncapi-breaking` gate compares the `asyncapi:` spec version (3.0.0), not this.
- **Servers** – Three declared: `sseLocal` (HTTP, localhost:3000), `subscriberEndpoint` (HTTPS with `{subscriberHost}`/`{subscriberPath}` variables, representing the *reverse* direction — the app opens the outbound connection), and `rabbitmqLocal` (AMQP, localhost:5672).
- **Channels** – 12 total, grouped by concern:
  - Observability (SSE): `observability.metrics.snapshot`, `.updated`, `.heartbeat`
  - Webhook events (subscriber endpoint): `order.created/paid/shipped/cancelled`, `payment.succeeded/failed`
  - Worker queues (RabbitMQ): `worker.webhook.deliver`, `worker.email.send`, `worker.image.digest`
- **Operations** – Explicit `send`/`receive` pairs for each flow. Notable patterns:
  - SSE: snapshot-on-connect, 5 s periodic update, 15 s keep-alive heartbeat.
  - Webhooks: `order.paid`/`order.shipped` are *derived* from `order.status_changed` (filtered on `to`), not standalone domain events.
  - Workers: publish (`receive` action) and consume (`send` action) are separate operations on the same channel; webhook retries go to a scheduled sweep, not requeue.
- **`components.messages.*`** – Referenced via `$ref` from every channel; actual schemas live in the source files listed in the header comment.

## Relationships

- **`docker-compose.production.yml`** – The `rabbitmqLocal` server (localhost:5672) and `sseLocal` (localhost:3000) in this spec correspond to services orchestrated by the production compose file. A change to the broker port, queue names, or service topology in the compose file should be reflected here (via the source YAML files that feed the bundle), and vice versa.

## Notes

- **Do not edit.** The file is overwritten on every `npm run contracts:bundle` run. Edit the five source files listed in the header comment instead.
- **Version-bump semantics:** `info.version` (2.0.0) is a *human-facing* changelog marker, not a machine gate. The `check:asyncapi-breaking` CI check reads the top-level `asyncapi:` key (3.0.0) and compares against `origin/main`; it will still report breaking changes until the current branch is merged.
- **`subscriberEndpoint` is not a real host.** It exists to satisfy `asyncapi-servers`/`asyncapi-channel-servers` spectral rules while encoding the fact that each subscription names its own URL at runtime.
- **Fan-out model:** One domain event → N queue messages (one per matching subscription), never one message read by N consumers. A slow subscriber delays only its own deliveries.
