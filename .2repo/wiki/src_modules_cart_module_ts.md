# src/modules/cart/module.ts

## Purpose
Single registration point for the cart module. Declares the module's identity (`name`, `subdomain`, `basePath`), wires its HTTP routes, declares its cross-module dependencies with DDD relationship labels, and subscribes to domain events that require cart cleanup. Satisfies the `AppModule` contract so the kernel can discover and boot the module.

## Key elements
- **`export default { … } satisfies AppModule`** – The module descriptor. Ties together routes, dependencies, event subscriptions, seeds, and locale path in one object.
- **`subscribe()`** – Registers two domain-event handlers: `PRODUCT_DELETED` → `productRemoveFromCartsById`, `USER_DELETED` → `cartDeleteByUserId`. This is how cart reacts to other domains without importing their internals.
- **`dependsOn`** – Six entries (account, delivery, orders, inventory, products, users) each labelled with a DDD relationship type (`customer-supplier`, `published-language`, `conformist`) and a one-line justification. Consumed by the kernel/observability tooling.
- **`routes: router`** – Re-exports the Hono router defined in `./routes`.
- **`seeds` / `seedExport`** – Demo-data functions from `./demo` for seeding and exporting the `carts` collection.
- **`demoShapes: { carts: 'stored' }`** – Tells the demo harness that the `GET /cart` response is derived (lines resolved against the live catalogue), so the stored row is the *input*, not the payload.
- **`locales`** – Path to the module's i18n directory.

## Relationships
- **`src/kernel/registry.ts`** – Imports the `AppModule` type used by the `satisfies` check.
- **`src/kernel/events.ts`** – Imports `onDomainEvent` to subscribe to `PRODUCT_DELETED` / `USER_DELETED`.
- **`src/modules/cart/routes.ts`** – Imports the `router` instance to attach under `/cart`.
- **`src/modules/cart/services/index.ts`** – Imports `cartDeleteByUserId` and `productRemoveFromCartsById` for the event handlers.
- **`src/modules/cart/demo.ts`** – Imports `seedCartsCollection` and `exportSeededCarts`.
- **`src/modules/products/index.ts`** – Imports the `PRODUCT_DELETED` event constant.
- **`src/modules/users/index.ts`** – Imports the `USER_DELETED` event constant.
- **`src/modules.ts`** – Registers this module in the application's module list.

## Notes
- The file imports `PRODUCT_DELETED` and `USER_DELETED` *constants* (event names) from products/users, but the actual cleanup logic lives in `./services`. This keeps the import graph acyclic: products and users never import cart directly; they emit events, and cart listens.
- The `dependsOn` array is declarative metadata (read by docs/observability), not a runtime dependency-injection mechanism. The actual runtime calls happen inside the service and route files.
- `satisfies AppModule` (rather than `: AppModule`) preserves the literal types of the object's properties while still catching structural mismatches.
- `locales` uses `path.join(__dirname, 'locales')` — a CJS-style `__dirname`; the project must run under a transpiler/bundler that provides it, or the build output must be CJS.
