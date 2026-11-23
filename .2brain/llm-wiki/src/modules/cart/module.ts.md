---
source: src/modules/cart/module.ts
generated_at: 2026-11-22T04:33:38.122980+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/module.ts

## Purpose
Manifest entry for the `cart` module: a per-user shopping cart priced against the live product catalogue. It wires the module's routes, config, rate limits, personal-data hooks, domain-event subscription and locales into the kernel registry.

## Key elements
- **Default export** (`satisfies AppModule`): the module manifest.
  - `name: 'cart'`.
  - `mounts`: the `router` from `./routes`, mounted at `/cart`.
  - `config`: `[cartConfig.slice]`.
  - `rateLimits`: `cartRateLimits`.
  - `personalData`: one `cart` section.
    - `collect` returns the user's cart lines reduced to `{ productId, quantity }`.
    - `erase` calls `cartService.deleteByUserId(userId, session)`, so it runs inside the caller's hard-delete transaction.
  - `subscribe`: registers an `onDomainEvent` handler for `PRODUCT_DELETED`.
    - It first checks `productService.isLive(productId)`.
    - If the product is not live, it calls `cartService.productRemoveFromCartsById(productId, titles)`.
  - `locales`: the `locales` directory next to this file.

## Relationships
- `src/kernel/registry.ts`: supplies the `AppModule` type that the manifest must satisfy.
- `src/kernel/events.ts`: supplies `onDomainEvent`, used for the subscription.
- `src/modules/cart/routes.ts`, `src/modules/cart/config.ts`, `src/modules/cart/rate-limits.ts`, `src/modules/cart/services/index.ts`: supply the router, config slice, rate limits and `cartService` (`get`, `deleteByUserId`, `productRemoveFromCartsById`).
- `src/modules/products/index.ts`: supplies `PRODUCT_DELETED` and `productService`. The dependency is one-way: products does not import cart and instead reaches it through the domain event.
- The header comment names these other modules as dependencies: users, orders, delivery, payments, addresses, inventory and shop. None are imported here, so the dependencies live in the cart services. Users reaches cart through this module's own `personalData.erase` hook, not an import.
- `src/modules.ts` is a neighbour in the graph. This file's content does not show how it uses the manifest.
- `src/modules/cart/asyncapi.domain-events.yaml`, `src/modules/cart/tests/integration/service.test.ts` and `tests/support/checkout-modules.ts` are graph neighbours. The file content does not show how they relate to it.

## Notes
- The import graph is meant to stay acyclic. That is why products and users call back into cart through an event and a hook rather than an import.
- `collect` strips the joined product data (name, price) on purpose. That data belongs to the catalogue, and the shared `CartItem` contract has `additionalProperties: false`.
- The `PRODUCT_DELETED` handler skips products that are live again. A retried delivery can arrive after a restore, and removing the line would wrongly tell the shopper the product was removed.
