---
source: src/modules/orders/module.ts
source_sha256: 6479a4a0e5ed383b5ab76f37c4b236dc543b98743509f3db941981847487f98c
context_sha256: 9e900b0f5a4a44ea3c9f2a720f26e5ffa4f4d89dfb54222d1fb9d5fcc27e1e47
generated_at: 2026-11-22T06:15:58.932218+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/module.ts

## Purpose
Manifest entry for the `orders` module: placed orders, with admin write and soft delete, plus each account reading back its own. It declares the module's routes, jobs, config slice, rate limits, public webhook events, personal-data hooks, event subscriptions, locales/templates, and the shop scenario's order states. Order invariants (totals, status transitions, cancel restoration) are documented in the tactical-ddd page referenced by the file's header, not in this file.

## Key elements
- **Default export** (`satisfies AppModule`): the manifest.
  - `name: 'orders'`, mounted at `/orders` via `router` from `./routes`.
  - `jobs` (`ordersJobs`), `config` (`[ordersConfig.slice]`), `rateLimits` (`ordersRateLimits`).
  - `reencrypt`: `orderService.reencryptOrders`, because the frozen addresses and notes are PII-encrypted.
  - `locales` and `templates`: directories next to this file.
- **`publicEvents`** (webhook-visible events, mapped via `toPublicEvent`):
  - `ORDER_CREATED` becomes `order.created`.
  - `ORDER_STATUS_CHANGED` becomes `order.paid` only when `to === 'paid'`, and `undefined` (no public event) for any other transition.
  - `ORDER_CANCELED` becomes `order.canceled`, carrying `orderId` and `cause`. The refund flag is not exposed.
  - `ORDER_REDACTED` becomes `order.redacted`.
- **`personalData`**:
  - Section `orders`:
    - `collect` calls `findOwnOrders`.
    - `erase` calls `eraseUserOrders`, which detaches the orders from the user inside the hard-delete transaction instead of deleting them. A never-paid order is also canceled after the commit.
    - `minimise` calls `startOrderPiiClock`.
  - Section `orderTimeline`: `collect` only, via `collectTimelineOf`. The export includes staff text and actors. It is erased with the orders' detach.
- **`subscribe()`**: registers three domain-event handlers.
  - `RESERVATION_EXPIRED` calls `orderService.expireReservationById`, so the order is canceled as `SYSTEM_ACTOR`.
  - `ORDER_CREATED` calls `mailOrderPlaced`.
  - `ORDER_CANCELED` runs `mailOrderCanceled` and `considerPurchaseHold` together.
- **`scenario.shop`**: the list of order states that the storefront and admin have screens for. It covers pending, paid, shipped, partially fulfilled, on hold, delivered, withdrawal-window variants, canceled, soft-deleted, offline/transfer, and image-resolution cases.

## Relationships
- **`src/kernel/registry.ts`**: supplies the `AppModule` and `PublicEventTarget` types. Its `resolvePublicEvents` reads `publicEvents` generically.
- **`src/kernel/events.ts`**: supplies `onDomainEvent` and `DomainEventMap`, used for subscriptions and typed payloads.
- **`src/modules/inventory/index.ts`**: provides `RESERVATION_EXPIRED`. When it fires, this module cancels the order. `inventory` cannot do that without importing orders. The event is described in `src/modules/inventory/asyncapi.domain-events.yaml`.
- **`src/modules.ts`**: the aggregate list that registers module manifests such as this one.
- **`src/modules/invoicing/module.ts`**: depends on orders and reacts to `ORDER_STATUS_CHANGED` itself. This file has no import of or wiring for `invoicing`.
- **`src/modules/account/module.ts`**: a sibling manifest. This file does not interact with it directly.
- **Tests**: the invoicing integration tests, the delivery `lost-parcel` test and the observability `metrics-overview-shop` test exercise order flows.

## Notes
- Event constants are imported from `./events` directly, never through the module's own barrel (per CLAUDE.md "Module barrels").
- The module has no queue consumer of its own.
- Dependency direction: `orders` depends on `products` and `inventory`, and `cart` depends on `orders`, which keeps the import graph acyclic.
- Order lines copy catalogue fields into the module's own `orderLineProductSchema`, not `products`' `productSchema`. The copy therefore carries no live warehouse counter.
- `users` is reached through the `personalData.erase` hook and through `userService.getById`, used for the buyer's stored locale in emails. It is never used for authorization state.
- `expireReservationById` calls back into `releaseForOrder`, which finds the hold already released. The two paths converge and cannot double-release.
- `considerPurchaseHold` logs its own failures and never rejects, so it cannot stall the cancel mail or later order events.
- Every `scenario.shop` order is produced by `scenarios/flows/shop-history.ts` driving the real endpoints, not seeded. Ids are minted at boot and served by `GET /__test/scenario`. A scenario test holds this list equal to what the runner recorded.
