---
source: asyncapi.public.yaml
sha256: 310e38ef5ab66752be55f5bf5b8f574b7655391d1dbfaf247b699beec5cbbb4f
generated_at: 2026-10-01T12:17:05.313011+00:00
model: ollama:qwen3.8:27b
---

# asyncapi.public.yaml

## Purpose

A **code-generated** AsyncAPI 3.0.0 contract that bundles all event-driven channel definitions (SSE observability + webhook events) into a single public artifact. It is produced by `npm run contracts:bundle` and must never be hand-edited. It exists so that external subscribers, Spectral rules, and the type generator (`generate-asyncapi-types.ts`) have one authoritative source describing every channel, message shape, and delivery semantics the backend exposes.

## Key elements

- **Servers**
  - `sseLocal` – local HTTP host for the SSE endpoint at `/observability/events`.
  - `subscriberEndpoint` – a *variable* HTTPS server (`{subscriberHost}`/`{subscriberPath}`) representing the arbitrary outbound URL each subscription configures. Not a server this app runs.

- **Channels**
  - `observability.metrics.snapshot` / `observability.metrics.updated` / `observability.heartbeat` – SSE channels (tagged `x-transport: sse`). The `x-transport` key is what the type generator uses to pick SSE channels, not the name prefix.
  - `order.created`, `order.paid`, `order.shipped`, `order.cancelled` – webhook channels bound to `subscriberEndpoint`.
  - `payment.succeeded`, `payment.failed`, `payment.refunded` – webhook channels for payment lifecycle.
  - `return.requested`, `return.received`, `return.closed` – webhook channels for the returns flow.

- **Operations** – one `send` operation per channel, each carrying a `summary`, a human-readable `description` (with cross-references to the implementing code), and a `$ref` to the message definition.

- **`info.version: 2.0.0`** – bumped to document the Standard Webhooks envelope break (`{ type, timestamp, data }` + signed headers). This is a human-readable annotation; it does not affect the `check:asyncapi-breaking` gate, which compares the `asyncapi:` spec version (3.0.0).

- **`defaultContentType: application/json`** – all messages are JSON.

## Relationships

| Neighbor | Interaction |
|---|---|
| `shared/contracts/asyncapi.root.yaml` | Bundle source. Provides the root `asyncapi` version, `id`, and `info` block that this file inherits. |
| `src/modules/observability/asyncapi.yaml` | Bundle source. Supplies the three `observability.*` SSE channels, their messages, and the `sseLocal` server. |
| `src/modules/webhooks/asyncapi.yaml` | Bundle source. Supplies the Standard Webhooks envelope (signed headers, `type`/`timestamp`/`data` shape) and the `subscriberEndpoint` variable server used by all webhook channels. |
| `src/modules/orders/events.ts` | Implements the domain events (`order.status_changed`, `order.cancelled`) that feed the `order.*` webhook channels. `order.paid` and `order.shipped` are *derived* from `order.status_changed` by filtering on `to`. |
| `src/modules/orders/services/crud.ts` | Fires `order.created` via `recordCreated`; the `webhookOrderCreated` operation description points here. |
| `src/modules/payments/events.ts` | Implements the domain events behind `payment.succeeded`, `payment.failed`, and `payment.refunded` webhook channels. |

## Notes

- **Generated file** – the first two lines are an explicit "DO NOT EDIT" guard. Any change must go through one of the three source files and be re-bundled.
- **`x-transport` vs. name prefix** – tooling (specifically `generate-asyncapi-types.ts`) selects SSE channels by the `x-transport: sse` annotation, not by the `observability.` prefix. A channel outside that namespace could carry the same prefix without being SSE.
- **Version-bump is cosmetic** – the `info.version: 2.0.0` bump documents a contract break for humans; it does *not* silence the `check:asyncapi-breaking` gate, which still reports real breaking changes against `origin/main` until the work is merged.
- **`subscriberEndpoint` is not a host** – it is a template resolved per subscription. Spectral's `asyncapi-servers` and `asyncapi-channel-servers` rules still pass because every webhook channel explicitly binds to this declared server.
- **`order.paid` / `order.shipped` are not 1:1 domain events** – they are projections of `order.status_changed` filtered by `to`. Only `order.created` and `order.cancelled` map one-to-one to their own domain events.
