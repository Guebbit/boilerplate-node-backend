---
source: src/modules/delivery/module.ts
sha256: a3db904688fbfc070f29b9431957325e64269b48d507ea7ccd5df5ccebf792ed
generated_at: 2026-11-08T05:31:16.045894+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/module.ts

## Purpose

Module manifest for the **delivery** domain (shipping rates, fulfillment orders, shipments). It wires together the module's HTTP routes, background jobs, event subscriptions, public webhook projections, PII export sections, and config into a single `AppModule` object consumed by the kernel at startup. It exists so the rest of the system (routing, webhooks, outbox, jobs, personal-data export) can discover delivery's surface through the generic `AppModule` contract rather than importing delivery internals.

## Key elements

- **`shipmentData(payload)`** — helper that normalises a `ShipmentEventPayload` into the flat shape every `shipment.*` webhook body carries (`orderId`, `shipmentId`, `fulfillmentOrderId`, `lines`).
- **`publicEvents`** — `Readonly<Record<string, PublicEventTarget>>` mapping three domain events (`SHIPMENT_SHIPPED`, `SHIPMENT_DELIVERED`, `SHIPMENT_LOST`) to public webhook payloads. `SHIPMENT_LOST` additionally exposes `reason` (the code, not the free-text buyer message). The `webhooks` module resolves these via the kernel registry; it never imports this module directly.
- **Default export (`AppModule`)** — the manifest object with:
  - `mounts` — two route tables: `/delivery` (delivery's own routes) and `/orders` (order-scoped routes like `POST /orders/{id}/process`).
  - `jobs` — background jobs from `./jobs`.
  - `config` — slice of delivery configuration.
  - `publicEvents` — the webhook map above.
  - `reencrypt` — `deliveryService.reencryptShipments` for PII re-encryption of destination copies.
  - `personalData` — two export sections (`shipments`, `fulfillmentOrders`) that resolve the subject's order IDs via `orderService.ownOrderIds`, fetch the delivery records, and shape them through the presenter.
  - `subscribe()` — registers all domain-event handlers (see Relationships).
  - `locales` / `templates` — filesystem paths for i18n strings and notification templates.

## Relationships

- **`@kernel/events`** (`src/kernel/events.ts`) — `onDomainEvent` is the subscription mechanism; `DomainEventMap` provides payload types for the `publicEvents` handlers.
- **`@kernel/registry`** (`src/kernel/registry.ts`) — supplies the `AppModule` and `PublicEventTarget` types that shape this file's exports. The kernel's `resolvePublicEvents` reads the `publicEvents` record at webhook-dispatch time.
- **`@modules/orders`** — imports `orderService` and four event constants (`ORDER_CANCELED`, `ORDER_REDACTED`, `ORDER_STATUS_CHANGED`, `ORDER_STATUS_OVERRIDDEN`). The subscribe block reacts to all four; `personalData` collectors call `orderService.ownOrderIds` to resolve the subject's orders before querying delivery data.
- **`@modules/inventory`** — imports `PREORDER_ALLOCATED`; a subscription releases a fulfillment order when backorder stock is allocated.
- **`@modules/products`** — imports `PRODUCT_RELEASE_DATE_CHANGED` and `PRODUCT_RESTOCK_DATE_CHANGED`; a subscription calls `deliveryService.onDateChanged` to notify already-paid buyers.
- **`./routes`** — provides the `router` mounted at `/delivery`.
- **`./order-routes`** — provides `orderRouter` mounted at `/orders`.
- **`./config`** — provides `deliveryConfig.slice` for the module's configuration section.
- **`./services/index`** — provides `deliveryService`, the primary business-logic object used in every subscription handler, the reencrypt hook, and both personal-data collectors.
- **`./presenter`** — provides `presentExportShipment` and `presentExportFulfillmentOrder` for shaping personal-data export output.
- **`./events`** — imports five event constants and `ShipmentEventPayload`. The comment explicitly notes this import is reached directly (not via the module barrel) to install the module's event declarations per the project's module-barrel rule.
- **`./jobs`** — provides `deliveryJobs` registered in the manifest.
- **`src/modules/delivery/asyncapi.webhooks.yaml`** / **`openapi.yaml`** / **`module.yaml`** — declarative specs that mirror the routes and public events declared here.
- **`src/modules.ts`** — the top-level module registry that loads this manifest.
- **`src/modules/delivery/tests/integration/backorder.test.ts`** — integration test exercising the backorder-allocation flow wired in `subscribe`.

## Notes

- The `events.ts` import is deliberately bypassed through the module barrel; the file-level comment and the project's CLAUDE.md "module-barrel rule" mandate reaching `./events` directly so that the event declarations register without triggering circular barrel loads.
- `ORDER_STATUS_CHANGED` is subscribed but the handler only acts when `to === OrderStatus.paid`; all other status changes are ignored (`undefined`).
- The `SHIPMENT_LOST` public event intentionally omits the free-text buyer sentence; only the machine-readable `reason` code is exposed to webhooks.
- Personal-data collectors resolve order IDs through `orderService.ownOrderIds` specifically to avoid paging full order documents or hitting the `.search()` `_id`/`id` normalisation trap documented in the comment.
- The `reencrypt` hook exists because shipment destination copies are PII-encrypted at rest and must be re-keyed on re-encryption requests.
