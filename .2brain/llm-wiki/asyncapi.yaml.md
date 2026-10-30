---
source: asyncapi.yaml
sha256: 678b4ad3418b8ac5ffc5b0c2110353573df6082c33fef979bde7582092c8f8c1
generated_at: 2026-10-29T01:17:08.055797+00:00
model: ollama:qwen3.8:27b
---

# asyncapi.yaml

## Purpose

Machine-readable AsyncAPI 3.0.0 contract for all real-time and event-driven channels in the boilerplate backend (SSE streams, outbound webhooks, and RabbitMQ job queues). It is **generated** by `npm run contracts:bundle` from per-module fragment files; hand-editing it will be overwritten. It serves as the single source of truth consumed by the type-generator script, Spectral lint rules, and any client that needs to know what events the backend emits and on which transport.

## Key elements

- **`servers.sseLocal` / `servers.sseNotificationsLocal`** – `localhost:3000` HTTP endpoints for the observability and notification SSE streams.
- **`servers.subscriberEndpoint`** – A *variable* server (`{subscriberHost}{subscriberPath}`) representing the outbound HTTPS URL each webhook subscription configures. Not a server this app runs; the app is the sender.
- **`servers.rabbitmqLocal`** – `localhost:5672` AMQP broker for async worker job queues.
- **`channels.*`** – One entry per event channel. Bound to exactly one server (SSE, webhook, or RabbitMQ). Each carries a single `messages` entry via `$ref` into `components.messages`.
- **`x-transport: sse`** – Custom extension on SSE channels. Read by `scripts/contracts/generate-asyncapi-types.ts` to select which channels produce SSE types; the `observability.` name prefix alone is not sufficient.
- **`info`** – Identifies the contract as version `0.1.0` (alpha), AGPL-3.0, tied to the `boilerplate-node-backend` project.

## Relationships

- **`docker-compose.production.yml`** – Provides the runtime infrastructure referenced by this file's servers: the `localhost:3000` HTTP/SSE service and the `localhost:5672` RabbitMQ broker. In production the ports/hosts would differ, but the channel topology defined here remains the contract that consumers build against.

## Notes

- **Do not edit.** The header comment and the `npm run contracts:bundle` pipeline regenerate this from `shared/contracts/asyncapi.root.yaml` plus per-module fragments under `src/modules/*/asyncapi*.yaml`.
- **`subscriberEndpoint` is not a fixed address.** Every webhook subscription carries its own HTTPS URL at runtime; the `variables` block (`subscriberHost`, `subscriberPath`) is documentation, not a deployment target. Spectral rules pass because the channel-level `servers` binding is what they validate.
- **Version field is informational only.** The breaking-change CI check explicitly ignores `info.version`; it mirrors the OpenAPI root version for consistency, not for semantic gating.
- **`worker.*` channels** (e.g. `worker.account.export`, `worker.webhook.deliver`) are internal job-queue messages on RabbitMQ, not externally observable webhooks. They share this document because the same bundling step assembles them.
