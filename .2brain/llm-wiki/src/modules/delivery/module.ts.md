---
source: src/modules/delivery/module.ts
sha256: e2abf2f62809deb879fc4e693e7cc8bf8891c95cdb979f3237d3a1f50ed47b05
generated_at: 2026-10-14T15:24:27.746106+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/module.ts

## Purpose

Module entry point for **delivery** (shipping rates, fulfillment orders, shipments). Wires the module into the kernel by declaring its routes, public webhook events, event subscriptions, personal-data export sections, locales, and config. It is the single `AppModule` manifest that `kernel/registry.ts` and `src/modules.ts` consume.

## Key elements

- **`default` export (`AppModule`)** — the full module manifest: `name`, `basePath` (`/delivery`), `routes`, `config` (delivery `slice`), `publicEvents`, `personalData`, `subscribe`, `locales`, `templates`.
- **`shipmentData(payload)`** — shared projector that shapes the common fields (`orderId`, `shipmentId`, `fulfillmentOrderId`, `lines`) for both `shipment.*` webhook payloads.
- **`publicEvents`** — maps `SHIPMENT_SHIPPED` / `SHIPMENT_DELIVERED` domain events to public webhook objects (`shipment.shipped`, `shipment.delivered`). Resolved by `webhooks` via `resolvePublicEvents` in the kernel registry; no direct import of this module by name.
- **`subscribe()`** — registers five `onDomainEvent` handlers:
  - `ORDER_STATUS_CHANGED` → `ensureFulfillmentOrders` (only when `to === paid`)
  - `ORDER_CANCELLED` → `cancelAllForOrder`
  - `ORDER_STATUS_OVERRIDDEN` → `syncWithOverride`
  - `PREORDER_ALLOCATED` (from inventory) → `releaseAllocated`
  - `PRODUCT_RELEASE_DATE_CHANGED` (from products) → `onReleaseDateChanged`
- **`personalData`** — two export sections (`shipments`, `fulfillmentOrders`) that resolve the caller's order IDs via `ownOrderIds` then project through `presentExportShipment` / `presentExportFulfillmentOrder`.

## Relationships

- **`src/kernel/events.ts`** — provides `onDomainEvent` and `DomainEventMap` used in `subscribe()` and the `publicEvents` handlers.
- **`src/kernel/registry.ts`** — provides `AppModule` / `PublicEventTarget` types that shape this file's export; `resolvePublicEvents` consumes the `publicEvents` map at runtime.
- **`src/modules.ts`** — aggregates this module's default export into the app's module list.
- **`src/modules/delivery/config.ts`** — supplies `deliveryConfig.slice` (the DB schema section) included in the manifest.
- **`src/modules/delivery/events.ts`** — source of `SHIPMENT_DELIVERED`, `SHIPMENT_SHIPPED`, and `ShipmentEventPayload`. Imported directly (not via barrel) per the module-barrel rule.
- **`src/modules/delivery/presenter.ts`** — `presentExportFulfillmentOrder` / `presentExportShipment` used in the personal-data collectors.
- **`src/modules/delivery/routes.ts`** — `router` mounted at `/delivery`.
- **`src/modules/delivery/services/*`** — all event-handler business logic (`ensureFulfillmentOrders`, `cancelAllForOrder`, `syncWithOverride`, `releaseAllocated`, `onReleaseDateChanged`, `findShipmentsForOrders`, `findFulfillmentOrdersForOrders`) lives here; this file only wires them to events.
- **`src/modules.ts` → `@modules/orders`** — re-exports `ORDER_CANCELLED`, `ORDER_STATUS_CHANGED`, `ORDER_STATUS_OVERRIDDEN`, `ownOrderIds` consumed by this file.
- **`@modules/inventory`** — `PREORDER_ALLOCATED` event constant.
- **`@modules/products`** — `PRODUCT_RELEASE_DATE_CHANGED` event constant.
- **`src/modules/delivery/openapi.yaml`** — static API spec for the routes declared here (not imported at runtime).

## Notes

- The `./events` import is deliberately **direct**, never through `./services/index` or another barrel. The file's own comment cites the CLAUDE.md module-barrel rule.
- Event handlers are intentionally **fire-and-forget**: `emitDomainEvent` logs failures and the outbox retries. A missed `paid` is self-healed by the next read or `start` call.
- `personalData` collectors use `ownOrderIds` (from `@modules/orders`) to fetch IDs without paging full order documents, avoiding the `_id`/`id` normalization issue in `.search()`.
- Shipping is described in the docblock as shop-specific operational logic that does **not** warrant a full aggregate — the domain rules live in `./domain` as pure functions so cart checkout can price methods without importing this module's HTTP surface.
