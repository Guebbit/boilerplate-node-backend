---
source: asyncapi.yaml
sha256: 35a2d0271f056e124f76cf49d4c7c40bc8af67130478872136425953df124e19
generated_at: 2026-10-14T06:45:37.619192+00:00
model: ollama:qwen3.8:27b
---

# asyncapi.yaml

## Purpose

Auto-generated AsyncAPI 3.0.0 specification that bundles all event-driven contract fragments (SSE streams, outbound webhooks, and RabbitMQ worker queues) into a single canonical document. It exists so that consumers, workers, and tooling have one authoritative reference for every real-time channel the backend exposes. Do not edit manually — regenerate via `npm run contracts:bundle`.

## Key elements

- **Servers** — Four named endpoints:
  - `sseLocal` / `sseNotificationsLocal` — local `localhost:3000` HTTP servers for observability and notification SSE streams.
  - `subscriberEndpoint` — a *variable* server (`{subscriberHost}{subscriberPath}`) representing the per-subscription HTTPS URL that external receivers configure; the application calls outbound to this address.
  - `rabbitmqLocal` — local `localhost:5672` AMQP broker for job queues.
- **Channels (SSE)** — `observability.metrics.snapshot`, `observability.metrics.updated`, `observability.heartbeat`, `notifications.created`, `notifications.deleted`, `notifications.read`. Identified by the `x-transport: sse` extension (read by `scripts/contracts/generate-asyncapi-types.ts`).
- **Channels (Webhooks)** — `order.*`, `shipment.*`, `payment.*`, `return.*`, `example.published`. Each binds to `subscriberEndpoint` and carries a single message type.
- **Channels (Worker queues)** — `worker.account.export`, `worker.webhook.deliver`, `worker.email.send`, `worker.image.digest`. Bound to `rabbitmqLocal`; each represents a discrete job the corresponding worker consumes.
- **Operations** — Explicit `send` actions for the SSE channels (`sseMetricsSnapshot`, `sseMetricsUpdated`, `sseHeartbeat`), documenting cadence (5 s tick, 15 s heartbeat) and payload semantics.
- **Components / Messages** — All message schemas are `$ref`-ed from `#/components/messages/…`, defined in the source fragments.
- **Meta** — `id: urn:boilerplate-node-backend:asyncapi:contracts`, version `0.1.0` (alpha; `check:asyncapi-breaking` ignores it), `defaultContentType: application/json`.

## Relationships

- **docker-compose.production.yml** — The production compose file wires up the services this contract references (HTTP server on port 3000 for SSE, RabbitMQ broker on port 5672 for worker queues). The `servers` block in this file is the declarative counterpart to the container networking and port mappings defined there.

## Notes

- **Generated file.** The header lists every source fragment; edits must go to those fragments, then re-bundle.
- **`x-transport` is the SSE discriminator.** `generate-asyncapi-types.ts` keys off this extension, *not* the channel name prefix. Adding a channel outside the `observability` / `notifications` namespaces that is also SSE requires the extension.
- **`subscriberEndpoint` is not a host this app listens on.** It is an outbound target whose address is set per subscription at runtime. Spectral rules still pass because the webhook channels explicitly bind to it.
- **Metrics units are bytes.** The snapshot and updated events use the same units as `GET /observability/health` so dashboards can compare directly without conversion.
- **Heartbeat carries no payload fields** beyond the event type; its sole purpose is to prevent idle-connection timeouts in intermediate proxies and to distinguish "alive, nothing changed" from "stream died."
