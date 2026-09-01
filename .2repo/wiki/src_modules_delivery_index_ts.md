# src/modules/delivery/index.ts

## Purpose

Public barrel for the delivery module. It is the **only** surface a sibling module may import (same rule as `modules/products/index.ts`), re-exporting exactly two pure functions from `./domain` so that external callers can price a shipping method without learning that shipments, couriers, or a `shipmentRepository` exist.

## Key elements

- **`findShippingMethod`** (re-exported from `./domain`) — resolves a shipping method for a given context.
- **`priceShipping`** (re-exported from `./domain`) — returns the cost for a resolved method.

These two exports are the entire public API of the module; nothing else is exposed.

## Relationships

- **`src/modules/cart/services/checkout.ts`** — Consumes `findShippingMethod` and `priceShipping` through this barrel to price the chosen delivery method. This coupling is intentional: the frozen order total and the `/methods` quote must never disagree.
- **`src/modules/delivery/domain/index.ts`** — The sole upstream; this barrel re-exports its two functions and hides the rest of the domain (repositories, shipment entities, couriers) from external callers.

## Notes

- The module is deliberately two functions wide. Do not add re-exports here without updating the module contract documented in `docs/modules/delivery.md`.
- Sibling modules must import from this file, **not** from `./domain` directly — that is the import-boundary rule called out in the file header.
