# src/modules/cart/module.ts

## Purpose

The manifest (registration entry) for the shopping-cart module. It wires the cart's routes, domain-event subscriptions, demo seeding, and locale directory into the application's module registry so the kernel can mount, seed, and subscribe to the cart as a first-class feature.

## Key elements

- **Default export (`AppModule`-typed object)** — the module manifest consumed by the kernel registry. Fields:
  - `name` / `basePath` — identifier (`cart`) and route prefix (`/cart`).
  - `routes` — the cart router, re-exported from `./routes`.
  - `subscribe()` — registers two domain-event handlers via `onDomainEvent`:
    - `PRODUCT_DELETED` → calls `productRemoveFromCartsById(productId)` to strip the product from every cart that references it.
    - `USER_DELETED` → calls `cartDeleteByUserId(userId)` to purge a user's cart.
  - `seeds` / `seedExport` — demo-data helpers re-exported from `./demo`.
  - `demoShapes` — declares that the `carts` demo shape is `'stored'` (the persisted row is the input; the live `GET /cart` response resolves it against the catalogue).
  - `locales` — path to a `locales/` directory next to this file.

## Relationships

- **`src/kernel/registry.ts`** — provides the `AppModule` type that the default export satisfies.
- **`src/kernel/events.ts`** — provides `onDomainEvent`, the subscription mechanism used inside `subscribe()`.
- **`src/modules/cart/routes.ts`** — source of the `router` object mounted at the module's base path.
- **`src/modules/cart/services/index.ts`** — barrel import (`./services`) supplying `cartDeleteByUserId` and `productRemoveFromCartsById` for the event handlers.
- **`src/modules/cart/demo.ts`** — supplies `seedCartsCollection` and `exportSeededCarts` for the seeding contract.
- **`src/modules/products/index.ts`** — supplies the `PRODUCT_DELETED` event token (and, transitively, `productRemoveFromCartsById` lives in cart services but is triggered by this product-domain event).
- **`src/modules.ts`** — the top-level module aggregator that (presumably) imports this file to register the cart module in the app.
- **Tests** (`service.test.ts`, `stock.test.ts`, retention tests in orders/payments, `metrics-overview.test.ts`, products `service.test.ts`) — exercise the cart module indirectly through the event subscriptions and service functions wired here.

## Notes

- The file imports `USER_DELETED` from `@modules/users`, which is **not** in the listed graph neighbors — that dependency exists but is outside the provided neighbor set.
- `demoShapes.carts: 'stored'` is a deliberate contract: the `GET /cart` handler re-prices lines against the live catalogue, so the stored document is the *input*, not the API response. Any tooling that reads the demo shape should expect stored (unpriced) rows.
- Event subscriptions are registered inside a `subscribe()` callback (lazy), not at import time, so the kernel controls when they activate.
- The migration file `20260808160000-cart-collection.js` (referenced in the docblock) creates the cart collection and reads `users`, but is **not** an import of this file.
