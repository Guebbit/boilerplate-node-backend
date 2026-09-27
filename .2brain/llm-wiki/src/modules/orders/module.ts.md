---
source: src/modules/orders/module.ts
sha256: b2554e086460c73f63c5f3667259e31d99a464b6973966a85d2210c29b57e7e6
generated_at: 2026-09-27T15:11:47.119540+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/module.ts

## Purpose

The module manifest for the **orders** domain. It registers the module with the kernel (name, base path, permissions, routes), declares public webhook event mappings, subscribes to cross-module domain events (reservation expiry, product removal), defines personal-data handling (GDPR erase), and lists the storefront scenario states. It is the single file that ties the orders services, routes, events, and rate limits together as one `AppModule` export.

## Key elements

- **`publicEvents`** — Maps the three internal domain events (`ORDER_CREATED`, `ORDER_STATUS_CHANGED`, `ORDER_CANCELLED`) to their public webhook payloads. `ORDER_STATUS_CHANGED` is the only non-trivial mapping: it derives `order.paid` or `order.shipped` from `payload.to` and returns `undefined` for every other transition.
- **`export default`** — The `AppModule` object:
  - `permissions` — Six keys (`orders.self.read` … `orders.any.override`) this module introduces.
  - `routes` — The Express router from `./routes`.
  - `requiredConfig` — `NODE_SHOP_COUNTRY` (min length 1), mandatory for invoice jurisdiction.
  - `personalData` — `collect` calls `findOwnOrders`; `erase` calls `detachUserId` (detaches the buyer reference without deleting the order row).
  - `subscribe` — Registers three `onDomainEvent` handlers:
    - `RESERVATION_EXPIRED` → auto-cancels the order as `SYSTEM_ACTOR`.
    - `PRODUCT_DELETED` (hard-delete only) → cancels pending orders holding that product.
    - `PRODUCT_DEACTIVATED` → same cancellation path.
  - `rateLimits` — Imported from `./rate-limits.ts` (every invoice render spawns a Chromium launch).
  - `scenario.shop` — The 12 order-state fixtures the integration test runner must reproduce.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/registry.ts` | Provides the `AppModule` / `PublicEventTarget` types this file satisfies. |
| `src/kernel/permissions.ts` | Supplies `SYSTEM_ACTOR`, used as the actor when the reservation-expiry sweep cancels an order. |
| `src/kernel/events.ts` | Provides `onDomainEvent` and the `DomainEventMap` type used in subscription callbacks. |
| `src/modules/inventory/index.ts` | Imports `RESERVATION_EXPIRED`; the orders module listens for it but never imports inventory's cancel logic (keeps the graph acyclic). |
| `src/modules/orders/events.ts` | Imports the three event-name constants directly (bypassing the module barrel per the project's module-barrel rule). |
| `src/modules/orders/services/index.ts` | Barrel re-export of `cancelById`, `cancelPendingOrdersHolding`, `detachUserId`, `findOwnOrders` (individual services live in `services/cancel.ts`, `services/crud.ts`, etc.). |
| `src/modules/orders/routes.ts` | The `router` object attached to the manifest. |
| `src/modules/orders/rate-limits.ts` | The `ordersRateLimits` config attached to the manifest. |
| `src/modules.ts` | Top-level registry that imports this module's default export to mount it. |
| `src/modules/orders/module.yaml` | Paired declarative manifest (config schema, etc.) read alongside this file. |

## Notes

- The module deliberately does **not** import `@modules/products` directly. Product fields are copied into its own `orderLineProductSchema` at purchase time so the embedded line has no live warehouse counter. Product events (`PRODUCT_DELETED`, `PRODUCT_DEACTIVATED`) are consumed, not the product service.
- The `RESERVATION_EXPIRED` handler and the explicit cancel path both call `cancelById` → `releaseForOrder`. Because `releaseForOrder` is idempotent (a hold already released is a no-op), the two paths converge without double-releasing units.
- `ORDER_STATUS_CHANGED` is the only public event whose `toPublicEvent` can return `undefined` (non-paid, non-shipped transitions are suppressed at the webhook layer, not the domain layer).
- `personalData.erase` uses **detach, not delete**: the order row survives the account deletion within the same hard-delete transaction (DDD-D6 invariant).
- The `scenario.shop` list is asserted in both directions by `tests/integration/scenarios/shop.test.ts` against the ids actually minted by `scenarios/flows/shop-history.ts`; adding a state here without a matching flow will fail that test.
