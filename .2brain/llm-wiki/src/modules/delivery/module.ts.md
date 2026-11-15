---
source: src/modules/delivery/module.ts
sha256: 139e07ff025adc07ba6e7090398aac556e0694d3ab1fcbdbff54092f924af1bb
generated_at: 2026-11-14T19:41:53.387508+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/module.ts

## Purpose

Module manifest entry that wires the delivery domain (shipping rates, fulfillment orders, shipments) into the application kernel. It registers HTTP mounts, subscribes to domain events from `orders`/`inventory`/`products`, declares the public webhook projections, and declares GDPR export/re-encryption sections — all in a single object the kernel registry consumes at boot.

## Key elements

- **`shipmentData(payload)`** — Projects a shipment event payload into the flat shape every public webhook carries (orderId, shipmentId, fulfillmentOrderId, lines).
- **`publicEvents`** — Maps the three internal shipment events (`SHIPMENT_SHIPPED`, `SHIPMENT_DELIVERED`, `SHIPMENT_LOST`) to public webhook targets consumed by the `webhooks` module via the kernel registry.
- **Default export (`AppModule`)** — The manifest object with:
  - `mounts` — Two route groups: `/delivery/*` (general) and `/orders/*` (the `POST /orders/{id}/process` endpoint).
  - `jobs` — Background jobs from `./jobs`.
  - `config` — The delivery config slice.
  - `reencrypt` — Re-encrypts PII on shipment destinations (destinations are stored encrypted).
  - `personalData` — Two export sections (`shipments`, `fulfillmentOrders`) that resolve a user's data via `orderService.ownOrderIds` then the delivery service.
  - `subscribe` — Registers ~11 `onDomainEvent` handlers reacting to order status changes, cancellation, redaction, pre-order allocation, date changes, and the module's own shipment events (for outgoing mail).
  - `locales` / `templates` — Filesystem paths relative to this directory.

## Relationships

- **src/kernel/events.ts** — Provides `onDomainEvent` and `DomainEventMap` used in `subscribe` and the `publicEvents` type annotations.
- **src/kernel/registry.ts** — Supplies the `AppModule` and `PublicEventTarget` types; its `resolvePublicEvents` is what the `webhooks` module calls to project this module's events without importing it by name.
- **src/modules.ts** — The application-level barrel where this module is composed (the file's own events are imported directly, not via this barrel, per the module-barrel rule).
- **src/modules/delivery/routes.ts** — Provides the `router` mounted at `/delivery`.
- **src/modules/delivery/order-routes.ts** — Provides `orderRouter` mounted at `/orders` (the order-scoped processing endpoint).
- **src/modules/delivery/services/index.ts** — Provides `deliveryService`; every event handler and the `reencrypt`/`personalData` collectors delegate to it.
- **src/modules/delivery/presenter.ts** — Provides `presentExportShipment` / `presentExportFulfillmentOrder` used by the GDPR export collectors.
- **src/modules/delivery/config.ts** — Provides `deliveryConfig` exposed in the manifest.
- **src/modules/delivery/jobs.ts** — Provides `deliveryJobs` registered in the manifest.
- **src/modules/delivery/events.ts** — Provides the event constant names and `ShipmentEventPayload` type; importing it also installs this module's event declarations into the kernel.
- **src/modules/delivery/module.yaml** — Static manifest metadata paired with this file.
- **src/modules/delivery/openapi.yaml**, **src/modules/delivery/authorization.yaml**, **src/modules/delivery/asyncapi.webhooks.yaml** — API/auth/webhook specs describing the surface declared here.
- **src/modules/delivery/tests/integration/backorder.test.ts** — Integration test exercising the backorder → allocation → release flow that `subscribe` wires up.

## Notes

- **Events are imported directly from `src/modules/delivery/events.ts`**, never through this module's own barrel — a convention enforced by CLAUDE.md's module-barrel rule.
- **`SHIPMENT_LOST` projection** intentionally exposes only the `reason` code; the free-text sentence staff write for the buyer is stripped out.
- **`subscribe` handlers are fire-and-forget by design**: failures are logged by `emitDomainEvent` and retried by the outbox. Missing fulfillment orders from a lost `paid` event are recovered by `start`, a pre-order allocation, or an operator re-emit.
- **`personalData` collectors** use `orderService.ownOrderIds` to obtain only the IDs, avoiding a full-order paged read and the `_id`/`id` normalization pitfall in `.search()`.
- **`shipmentData` projects lines to `{ productId, quantity }` only**, dropping any other fields present on the internal line objects.
