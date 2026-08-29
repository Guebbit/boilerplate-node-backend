# src/modules/products/module.ts

## Purpose

Module manifest for the product catalogue. Declares the `products` app module (routes, seeds, locales, demo shapes) as a single default export satisfying `AppModule`, and side-effect-imports the event registrations. It exists so the kernel can register the catalogue without needing to know its internals.

## Key elements

- **Default export (object `satisfies AppModule`)** — the registration contract:
  - `name: 'products'` / `subdomain: 'core'` — identity and Bounded-Context label.
  - `basePath: '/products'` — URL prefix for this module's routes.
  - `routes: router` — re-exported from `./routes`; mounted under `basePath`.
  - `seeds: seedProductsCollection` / `seedExport: exportSeededProducts` — imported from `./demo`; used to populate and snapshot the product collection.
  - `demoShapes: { products: 'response' }` — tells the demo harness to render `GET /products/:id` responses as-is.
  - `locales` — resolved to `__dirname/locales` for i18n resource loading.
- **`import './events'`** — pure side-effect import; registers product domain-event handlers (e.g. `product.deleted`) without a named binding.

## Relationships

- **`src/kernel/registry.ts`** — source of the `AppModule` type; this file satisfies it to participate in kernel registration.
- **`src/modules.ts`** — upstream aggregator that imports this default export to build the full module list.
- **`src/modules/products/routes.ts`** — provides the `router` mounted by this manifest.
- **`src/modules/products/demo.ts`** — provides the two seed helpers referenced here.
- **`src/modules/products/events.ts`** — side-effect import; its handlers run when the module is loaded.
- **`src/modules/products/tests/integration/service.test.ts`** — integration tests that exercise the routes/seeds wired through this manifest.
- **`src/modules/cart/tests/integration/service.test.ts`**, **`stock.test.ts`**, **`delivery/…/service.test.ts`**, **`payments/…/service.test.ts`** — downstream module tests that read seeded product data (via `seedProductsCollection`) or react to product events emitted through `events.ts`.
- **`docs/theory/reading-path.md`** — documents the intended reading order; this file is the entry point for the products module.

## Notes

- The module is deliberately a **leaf** in the dependency graph. The cart→product coupling (e.g. "empty the cart when a product is deleted") is expressed entirely through the `product.deleted` event so that this file never imports from `@modules/cart`.
- `import './events'` has no binding; the import order relative to the object literal is irrelevant, but the events are registered before any request can fire them because the module is loaded at boot.
- `satisfies AppModule` (not `: AppModule`) is used so the inferred literal type is preserved for downstream tooling while still being checked against the contract.
