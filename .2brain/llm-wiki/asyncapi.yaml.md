---
source: asyncapi.yaml
sha256: 7d319d48495e37279b0141d732304735479e308ca8ace29a7c2f4aa8baf20fd0
generated_at: 2026-10-07T23:45:57.496917+00:00
model: ollama:qwen3.8:27b
---

# asyncapi.yaml

## Purpose

Generated AsyncAPI 3.0.0 document that consolidates all real-time and event-driven contracts (SSE streams, outbound webhooks, and RabbitMQ worker queues) into a single spec. It is produced by `npm run contracts:bundle` from per-module fragments and serves as the authoritative channel/message reference for the runtime, type generation, and tooling.

## Key elements

- **Servers** — Four declared servers: `sseLocal` (localhost:3000, `/observability/events`), `sseNotificationsLocal` (localhost:3000, `/notifications/stream`), `rabbitmqLocal` (localhost:5672, AMQP), and `subscriberEndpoint` (variable HTTPS host+path for outbound webhook deliveries).
- **Channels** — Grouped by transport:
  - SSE: `observability.metrics.snapshot`, `observability.metrics.updated`, `observability.heartbeat`, `notifications.created`, `notifications.deleted`, `notifications.read` — all carry `x-transport: sse`.
  - Webhooks (subscriberEndpoint): `order.*`, `payment.*`, `return.*`, `example.published`.
  - Worker queues (rabbitmqLocal): `worker.account.export`, `worker.webhook.deliver`, `worker.email.send`, `worker.image.digest`.
- **Operations** — One `send` operation per channel, with human-readable summaries and descriptions of firing conditions.
- **`x-transport` extension** — Custom field on SSE channels; consumed by `scripts/contracts/generate-asyncapi-types.ts` to select which channels to treat as SSE (not by name prefix).
- **Components / Messages** — All message schemas are `$ref`-ed into a `components` section (truncated in the snippet) that defines the payload shapes.

## Relationships

- **docker-compose.production.yml** — The `rabbitmqLocal` server (AMQP on `localhost:5672`) and the HTTP SSE endpoints on `localhost:3000` correspond to the RabbitMQ broker and application services that `docker-compose.production.yml` provisions. The production compose file must expose those ports/hosts so the contract's server definitions resolve at runtime.

## Notes

- **Generated file — do not edit.** Changes belong in the per-module source fragments listed in the header comment (e.g. `src/modules/observability/asyncapi.yaml`, `shared/contracts/asyncapi.root.yaml`, etc.).
- **`subscriberEndpoint` is not a fixed server.** It uses `{subscriberHost}` / `{subscriberPath}` variables because each subscriber registers its own URL. Spectral rules (`asyncapi-servers`, `asyncapi-channel-servers`) still pass because channels bind to it; it simply resolves per subscription.
- **SSE detection relies on `x-transport: sse`**, not on the channel name. A new channel must include this extension to be picked up by the type-generation script.
- **Version `0.1.0` is alpha** (SemVer §4 initial development). The `check:asyncapi-breaking` script ignores this field, so version bumps here do not trigger breaking-change alerts.
- **`example.published`** is an intentional copy-paste template for the `example` module's single webhook, not a production concern.
