---
source: src/modules/delivery/module.ts
source_sha256: bbc3ea0e9f71e276aaabe323536281ff05c82aee568cb21fd8e3e8e4bdabfab9
context_sha256: a5e5c01de2f1efb8b24c111dd522ad9d04f60878df611ca9d20d54e8707a7300
generated_at: 2026-11-22T04:50:45.486640+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/module.ts

## Purpose
Manifest entry for the `delivery` module (shipping rates, fulfillment orders, shipments). It declares the module's routes, jobs, config slice, webhook-visible events, personal-data export sections, re-encryption hook, and domain-event subscriptions. It depends on `orders` and reaches stock, mail and language through `orders`' own exports.

## Key elements
- **Default export** (`satisfies AppModule`): the manifest, with `name: 'delivery'`, `mounts`, `jobs`, `config`, `publicEvents`, `reencrypt`, `personalData`, `subscribe`, `locales` and `templates`.
- **`mounts`**: `router` at `/delivery`, and `orderRouter` at `/orders` (for `POST /orders/{id}/process`, which uses the order's own URL but delivery's own key).
- **`shipmentData`**: helper that builds the shared webhook body (`orderId`, `shipmentId`, `fulfillmentOrderId`, and `lines` as `productId`/`quantity`).
- **`publicEvents`**: maps `SHIPMENT_SHIPPED`, `SHIPMENT_DELIVERED` and `SHIPMENT_LOST` to the public events `shipment.shipped`, `shipment.delivered` and `shipment.lost`. The lost event adds only the `reason` code, not the staff's free-text message.
- **`reencrypt`**: `deliveryService.reencryptShipments`, because the shipments' destination copies are PII-encrypted.
- **`personalData`**: the `shipments` and `fulfillmentOrders` export sections. Each gets the subject's order ids from `orderService.ownOrderIds`, loads the matching records through `deliveryService`, and formats them with `presentExportShipment` or `presentExportFulfillmentOrder`.
- **`subscribe`**: registers `onDomainEvent` handlers (see Relationships).
- **`locales` / `templates`**: the `locales` and `templates` directories next to the file.

## Relationships
- **`@kernel/registry`**: supplies the `AppModule` and `PublicEventTarget` types. `webhooks` reads `publicEvents` through `resolvePublicEvents`, so it never imports this module by name.
- **`@kernel/events`**: supplies `onDomainEvent` and `DomainEventMap`.
- **`./events`**: supplies the shipment and fulfillment-order event constants and `ShipmentEventPayload`. It is imported directly, not through the module's own barrel.
- **`./routes`, `./order-routes`**: the two routers mounted above.
- **`./config`**: supplies `deliveryConfig`, whose `slice` is the module's config.
- **`./jobs`**: `deliveryJobs`.
- **`./services`**: `deliveryService` does the work in every handler and in the export and re-encryption hooks.
- **`./presenter`**: formats the export records.
- **`@modules/orders`**: `orderService` plus the order events `ORDER_STATUS_CHANGED`, `ORDER_CANCELED`, `ORDER_REDACTED` and `ORDER_STATUS_OVERRIDDEN`.
- **`@modules/inventory`**: `PREORDER_ALLOCATED`.
- **`@modules/products`**: `PRODUCT_RELEASE_DATE_CHANGED` and `PRODUCT_RESTOCK_DATE_CHANGED`.
- **`src/modules.ts`**: the registry that presumably lists this manifest. The file itself doesn't show this.
- **`asyncapi.domain-events.yaml` and the integration tests** (`backorder`, `destination`, `lost-parcel`): related files, but this file doesn't reference them.

Subscriptions in `subscribe`:
- `ORDER_STATUS_CHANGED` with `to === paid` calls `ensureFulfillmentOrders`.
- `ORDER_CANCELED` calls `cancelAllForOrder`.
- `ORDER_REDACTED` calls `scrubDestinations`.
- `ORDER_STATUS_OVERRIDDEN` calls `syncWithOverride`.
- `PREORDER_ALLOCATED` calls `releaseAllocated`.
- The shipped, delivered, lost, delayed and hold-noticed events call the `mail*` handlers.
- `PRODUCT_RELEASE_DATE_CHANGED` calls `onDateChanged(productId, 'preorder')`.
- `PRODUCT_RESTOCK_DATE_CHANGED` calls `onDateChanged(productId, 'backorder')`.

## Notes
- The module docblock says it listens to `orders`' `paid` event. The code actually subscribes to `ORDER_STATUS_CHANGED` and filters on `OrderStatus.paid`.
- The docblock mentions `backorder_allocated`, but the code imports `PREORDER_ALLOCATED`.
- Order-event handlers react to facts `orders` already recorded and announced. A failure is logged by `emitDomainEvent` and retried by the outbox. Fulfillment orders lost with a `paid` event are recreated by `start`, by a preorder allocation, or when an operator revives the dead event.
- One public event fires per shipment, so an order shipped in two goes announces twice.
- Shipping rates are pure functions in `./domain`, so the cart's checkout can price a method without this module's HTTP surface.
