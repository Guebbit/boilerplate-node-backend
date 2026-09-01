# src/modules/products/module.ts

## Purpose

Entry-point manifest for the **products** module. It wires together the module's routes, seed data, locale files, and image writeback into a single `AppModule` object that the kernel registry can discover. It also documents the module's position in the dependency graph: a leaf node that everything else (cart, inventory, orders, wishlist) depends on, communicating downstream via events rather than direct imports.

## Key elements

- **`export default { … } satisfies AppModule`** — The module manifest. Fields:
  - `name: 'products'` / `basePath: '/products'` — identity and URL prefix.
  - `routes: router` — Hono/Fastify router from `./routes`.
  - `seeds` / `seedExport` — `seedProductsCollection` and `exportSeededProducts` from `./demo`, used by the demo/dev data pipeline.
  - `demoShapes: { products: 'response' }` — tells the demo harness to shape `GET /products/:id` responses.
  - `locales` — path to the `locales/` directory (resolved via `path.join(__dirname, 'locales')`).
  - `imageTargets: { products: { writeback: productRepository.writebackImage } }` — registers the repository method the inventory pipeline calls to persist generated image metadata.
- **`import './events'`** — Side-effect import; registers `product.deleted` (and likely other) event listeners at module load.

## Relationships

- **`src/kernel/registry.ts`** — Provides the `AppModule` type that the default export satisfies; the registry iterates collected manifests to mount routes, run seeds, and expose image targets.
- **`src/modules.ts`** — Aggregates this manifest (via `import` of the default export) so the kernel can discover the module at boot.
- **`src/modules/products/routes.ts`** — Supplies the `router` consumed by the manifest.
- **`src/modules/products/repository.ts`** — Supplies `productRepository.writebackImage` for the `imageTargets` field.
- **`src/modules/products/demo.ts`** — Supplies the two seed functions referenced in the manifest.
- **`src/modules/products/events.ts`** — Imported for side effects; registers event handlers (e.g. `product.deleted`) that downstream modules (cart, inventory) react to.
- **Test suites** (`cart/tests/…`, `delivery/tests/…`, `payments/tests/…`, `products/tests/integration/service.test.ts`) — Exercise the routes and service behavior this manifest exposes; they do not import this file directly but depend on the module being registered.

## Notes

- **Inventory ownership of stock fields:** The docblock explicitly states that `onHand` and `reserved` are declared on the product document but written *only* by the inventory module. This module (and its repository) must never mutate those fields; treat them as read-only from here.
- **Leaf-module discipline:** Downstream modules conform to the product shape rather than this module importing them. Cross-module effects flow through events (`product.deleted`) or image writeback callbacks, not direct service imports.
- **`satisfies AppModule` (not `: AppModule`):** The default export keeps its literal type for IDE inline hints while still being type-checked against the registry contract. Adding a new field without adding it to `AppModule` will be a compile error.
