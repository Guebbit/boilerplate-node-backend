# src/modules/cart/module.ts

## Purpose

Module manifest for the shopping-cart domain. Registers routes, domain-event subscriptions, demo seeding, and locale paths into the kernel's `AppModule` registry so the cart can be discovered and booted without hard-coding imports elsewhere.

## Key elements

- **`default` (satisfies `AppModule`)** — The module descriptor object. Exports:
  - `name: 'cart'`, `basePath: '/cart'`
  - `routes` — re-exported from `./routes`
  - `subscribe()` — hooks two domain-event handlers (see below)
  - `seeds` / `seedExport` — demo data lifecycle from `./demo`
  - `demoShapes` — declares that `carts` is a stored-shape (the stored row is the *input* to the `GET /cart` response, not the response itself)
  - `locales` — path to the module's locale directory

- **`subscribe()`** — On boot, registers:
  - `PRODUCT_DELETED` → calls `productRemoveFromCartsById(productId)`
  - `USER_DELETED` → calls `cartDeleteByUserId(userId)`

## Relationships

- **`src/kernel/registry.ts`** — provides the `AppModule` type that the default export satisfies.
- **`src/kernel/events.ts`** — provides `onDomainEvent`, used inside `subscribe()` to attach event handlers.
- **`src/modules/products/index.ts`** — source of the `PRODUCT_DELETED` event constant; the cart reacts to product removal by purging the SKU from every cart.
- **`src/modules/users/index.ts`** — source of the `USER_DELETED` event constant; the cart reacts by deleting the user's cart document.
- **`src/modules/cart/routes.ts`** — supplies the Express/Fastify router attached to `basePath`.
- **`src/modules/cart/demo.ts`** — supplies `seedCartsCollection` (insert) and `exportSeededCarts` (teardown) for demo/data-seeding flows.
- **`src/modules/cart/services/index.ts`** — re-exports `cartDeleteByUserId` and `productRemoveFromCartsById`, the two cleanup actions triggered by the event subscriptions.
- **`src/modules.ts`** — aggregates this module (via its default export) for kernel boot.
- **`src/modules/cart/tests/integration/service.test.ts`**, **`stock.test.ts`**, **`src/modules/observability/tests/unit/metrics-overview.test.ts`**, **`src/modules/payments/tests/integration/service.test.ts`**, **`src/modules/products/tests/integration/service.test.ts`** — integration/unit tests that exercise the cart module's registered routes and event handlers.

## Notes

- The cart deliberately **does not import** `orders`. The module doc-comment states that a checkout is "where a cart stops being a cart," and products/users communicate back to the cart *only* via domain events (`PRODUCT_DELETED`, `USER_DELETED`), keeping the import graph acyclic.
- The `demoShapes` entry (`carts: 'stored'`) is a contract hint for the demo/observability layer: the stored cart row is the *input* to `GET /cart` (which resolves lines against the live catalogue), not the raw response shape.
- A migration file `20260808160000-cart-collection.js` (referenced in the header comment) creates this module's DB collection and reads `users` — it is **not** an import of this file.
