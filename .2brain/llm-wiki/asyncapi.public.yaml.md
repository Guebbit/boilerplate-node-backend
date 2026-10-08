---
source: asyncapi.public.yaml
sha256: 697518d2ef186297e49361378dda22df54e9d9b651a4561905ef540f34ade8a6
generated_at: 2026-10-07T23:45:42.290647+00:00
model: ollama:qwen3.8:27b
---

# asyncapi.public.yaml

## Purpose

Generated, read-only AsyncAPI 3.0.0 contract that bundles all event-driven and real-time channel definitions from the individual module fragments into a single public document. It is produced by `npm run contracts:bundle` and exists so that consumers (dashes, webhook subscribers, type generators) have one canonical reference for every outbound event the backend emits.

## Key elements

- **`servers.sseLocal`** – Local HTTP endpoint (`localhost:3000`) backing the observability SSE stream at `/observability/events`.
- **`servers.sseNotificationsLocal`** – Local HTTP endpoint backing the notifications SSE stream at `/notifications/stream`.
- **`servers.subscriberEndpoint`** – A *variable* server (`{subscriberHost}{subscriberPath}`) representing the reverse direction: the backend opens an outbound HTTPS call to a subscriber-configured URL. It is not a host this application listens on.
- **Channels (observability `*`.)** – `observability.metrics.snapshot`, `observability.metrics.updated`, `observability.heartbeat`. Tagged with `x-transport: sse` (consumed by `scripts/contracts/generate-asyncapi-types.ts` to identify SSE channels).
- **Channels (domain webhooks)** – `order.*`, `payment.*`, `return.*`, `example.published`. Each binds to `subscriberEndpoint` and carries a single message.
- **Channels (notifications `*`.)** – `notifications.created`, `notifications.deleted`, `notifications.read`. Tagged `x-transport: sse`, bound to `sseNotificationsLocal`.
- **Operations** – One `send` operation per channel with a human-readable description of when/how the event fires and which source code produces it.
- **`components.messages`** (referenced, defined in the full file) – Typed payload schemas for every event.

## Relationships

- **`shared/contracts/asyncapi.root.yaml`** – Listed as the primary source in the generated header; provides the top-level `asyncapi`, `id`, `info`, `defaultContentType`, and `components` skeleton that the bundler expands.
- **`src/modules/observability/asyncapi.yaml`** – Source fragment contributing the three `observability.*` channels, the `sseLocal` server, and the corresponding operations.
- **`src/modules/webhooks/asyncapi.yaml`** – Source fragment contributing the domain webhook channels (`order.*`, `payment.*`, `return.*`, `example.published`) and the `subscriberEndpoint` server.
- **`src/modules/orders/events.ts`** – Runtime emitter for `order.paid`, `order.shipped` (derived from `order.status_changed`) and `order.cancelled`; the operation descriptions point here as the firing site.
- **`src/modules/orders/services/crud.ts`** – `recordCreated` is the emit point for `order.created` (fired on both admin create and storefront checkout).
- **`src/modules/payments/events.ts`** – Runtime emitter for `payment.succeeded`, `payment.failed`, and `payment.refunded`.

## Notes

- **Do not edit by hand.** The file header marks it as generated; all edits go to the per-module `asyncapi.yaml` fragments or `shared/contracts/asyncapi.root.yaml`, then `npm run contracts:bundle` is re-run.
- **`x-transport: sse` is load-bearing.** The type generator (`generate-asyncapi-types.ts`) keys off this extension to select SSE channels; it is *not* inferred from the channel name prefix. Omitting it on a new SSE channel will silently exclude it from generated types.
- **`subscriberEndpoint` is intentionally non-concrete.** Its `host`/`pathname` are variables because each subscription registers its own URL. Spectral rules (`asyncapi-servers`, `asyncapi-channel-servers`) still pass because the channels explicitly `$ref` this server.
- **`order.paid` / `order.shipped` are not standalone domain events.** They are derived by filtering `order.status_changed` on the `to` field; the `payments/events.ts` and `orders/events.ts` files are the canonical source of truth for the actual publish logic.
- **Version is `0.1.0`** and `check:asyncapi-breaking` explicitly ignores this field during semver checks.
