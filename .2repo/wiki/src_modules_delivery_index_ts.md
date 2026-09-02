# src/modules/delivery/index.ts

## Purpose

Public barrel (module facade) for the Delivery module. It is the **only** import surface a sibling module is allowed to use (same convention as `modules/products/index.ts`). Its job is to expose the minimal read-only API other modules need while keeping the module's write surface (`shipOrder`, `runCourierAdvance`) and infrastructure (`shipmentRepository`) invisible.

## Key elements

- **`findShippingMethod`, `priceShipping`** (re-exported from `./domain`) — Two pure pricing functions. A caller selects and prices a shipping method without learning that shipments, couriers, or a repository exist.
- **`findShipmentsForOrders`** (re-exported from `./service`) — The single shipment READ a sibling may perform (used by the account data export). No write or admin/courier operations are surfaced.

## Relationships

- **`src/modules/delivery/domain/index.ts`** — Upstream source of `findShippingMethod` and `priceShipping`. This file re-exports those two names verbatim.
- **`src/modules/delivery/service.ts`** — Upstream source of `findShipmentsForOrders`. This file re-exports that one name.
- **`src/modules/cart/services/checkout.ts`** — Consumes `findShippingMethod` / `priceShipping` through this barrel to price the chosen shipping method, keeping the frozen order total and the `/methods` quote consistent.
- **`src/modules/account/services/export.ts`** — Consumes `findShipmentsForOrders` through this barrel to include shipment data in the account export.

## Notes

- The barrel intentionally exposes **two pure functions and one read query and nothing else**. Any new cross-module need should be evaluated against that constraint before adding an export.
- Because pricing is the load-bearing contract (cart's checkout depends on it), changes to the domain pricing signatures break `checkout.ts` and the account-facing quote simultaneously — treat the domain pair as a unit when refactoring.
