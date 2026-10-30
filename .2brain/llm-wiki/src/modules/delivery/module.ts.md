---
source: src/modules/delivery/module.ts
sha256: f3a702a5dbba05b9d7e9818d10c4bc462612d3875d1b5e6681306db83d8a2f52
generated_at: 2026-10-29T03:35:36.577406+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/module.ts

## Purpose

Module manifest and wiring point for the **delivery** module (shipping rates, fulfillment orders, shipments). It registers routes, background jobs, config, public webhook projections, personal-data export sections, and domain-event subscriptions into the kernel's `AppModule` contract so the host can boot the module without knowing its internals.

## Key elements

- **`shipmentData(payload)`** — shared extractor that pulls `orderId`, `shipmentId`, `fulfillmentOrderId`, and `lines` from any `shipment.*` event payload for webhook projection.
- **`publicEvents`** — maps three internal events (`SHIPMENT_SHIPPED`, `SHIPMENT_DELIVERED`, `SHIPMENT_LOST`) to public webhook payloads (`shipment.shipped`, `shipment.delivered`, `shipment.lost`). `SHIPMENT_LOST` exposes only the `reason` code, not staff free-text.
- **`export default` (AppModule manifest)** — declares:
  - Two route mounts: `router` at `/delivery` and `orderRouter` at `/orders` (for `POST /orders/{id}/process`).
  - `jobs`, `config`, `locales`, `templates`.
  - `reencrypt: deliveryService.reencryptShipments` — re-encrypts PII on shipment destinations.
  - `personalData` — two GDPR export sections (`shipments`, `fulfillmentOrders`) that resolve order IDs via `orderService.ownOrderIds` before querying delivery documents.
  - `subscribe()` — registers `onDomainEvent` handlers for: `ORDER_STATUS_CHANGED` (paid → create fulfillment orders), `ORDER_CANCELLED`, `ORDER_REDACTED` (scrub addresses), `ORDER_STATUS_OVERRIDDEN`, `PREORDER_ALLOCATED`, `SHIPMENT_SHIPPED/DELIVERED/LOST` (mail), `FULFILLMENT_ORDER_DELAYED/HOLD_NOTICED` (mail), `PRODUCT_RELEASE_DATE_CHANGED`, `PRODUCT_RESTOCK_DATE_CHANGED`.

## Relationships

- **`src/kernel/registry.ts`** — provides the `AppModule` and `PublicEventTarget` type contracts that this manifest satisfies; `resolvePublicEvents` reads `publicEvents` at runtime.
- **`src/kernel/events.ts`** — provides `onDomainEvent` (used in `subscribe`) and the `DomainEventMap` type (used to type `toPublicEvent` callbacks).
- **`src/modules/orders`** (not a listed neighbor but imported) — supplies `orderService` (for `ownOrderIds`, used in personal-data export) and order event constants that drive the `subscribe` handlers.
- **`src/modules/delivery/config.ts`** — supplies `deliveryConfig` (sliced into the manifest).
- **`src/modules/delivery/events.ts`** — supplies the internal event constants and `ShipmentEventPayload` type consumed by `publicEvents` and `subscribe`.
- **`src/modules/delivery/jobs.ts`** — supplies `deliveryJobs`.
- **`src/modules/delivery/routes.ts` / `order-routes.ts`** — supply the two Hono routers mounted by the manifest.
- **`src/modules/delivery/presenter.ts`** — supplies `presentExportShipment` / `presentExportFulfillmentOrder` for GDPR export shaping.
- **`src/modules/delivery/services/index.ts`** — supplies `deliveryService`, the single service object used by every handler, the reencrypt hook, and the personal-data collectors.
- **`src/modules.ts`** — aggregates this module's default export so the host can discover it without importing the path directly.

## Notes

- **Barrel rule:** the `./events` import is a direct path, not a barrel re-export. The inline comment references a project-level convention (CLAUDE.md "module-barrel rule") — do not route this import through a barrel.
- **Idempotency is external:** `subscribe` handlers are fire-and-forget; the outbox in `kernel/events` retries on failure. Lost `paid` events are reconciled by the next read or `start`, not by local retry logic here.
- **Order-ID resolution for PII exports:** the code deliberately calls `orderService.ownOrderIds` instead of paging full order documents, avoiding a `_id`/`id` normalization trap in `.search()`. Keep this pattern if adding new personal-data sections.
- **`SHIPMENT_LOST` webhook** intentionally omits the staff-written sentence; only the machine-readable `reason` code is public.
- **`orderRouter` mount path** is `/orders`, not `/delivery/orders` — it lives on the order's own URL space but is owned by delivery.
