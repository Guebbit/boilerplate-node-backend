# src/modules/products/index.ts

## Purpose

Public barrel (single entry point) for the products module. It defines the only API surface that sibling modules may import, keeping the production interface deliberately narrow so that each export represents a stable contract. Lint (`eslint-plugin-boundaries`) enforces this: importing deeper paths like `@modules/products/service` from outside is a compile-time error.

## Key elements

- **`productService`** — the module's service instance, exported for sibling modules that need product queries or mutations.
- **`productRepository`** — the data-access layer, exported alongside the service for modules that need direct repository access.
- **`ProductDocument`** (type) — the full Mongoose document shape.
- **`ProductSnapshot`** (type) — a product's stored fields stripped of document machinery; the shape `orders` embeds on every order line to freeze the product state at purchase time.
- **`productSchema` / `applyProductTransform`** — the Mongoose schema and its serialization transform, published so that `orders` can snapshot a product's shape rather than hold a live reference (preventing later catalogue edits from rewriting order history).
- **`PRODUCT_DELETED`** (event constant) — the module's emitted event; importing the barrel is also what installs the payload type declaration.

## Relationships

- **`src/modules/orders/model.ts`, `src/modules/orders/factory.ts`, `src/modules/orders/service.ts`** — consume `ProductSnapshot`, `productSchema`, and `applyProductTransform` to embed a denormalised product copy on each order line.
- **`src/modules/cart/module.ts` and cart services** — listed as a consumer of the *second* public path (`@modules/products/demo`) for seeders, not this barrel.
- **`src/modules/inventory/service.ts`, `src/modules/inventory/metrics.ts`** — graph neighbours that interact with product data; their coupling is asserted by the same boundary lint rules that gate this barrel.
- **Integration test files** (`cart`, `inventory`, `orders`, `account`) — exercise the public surface defined here rather than reaching into internal paths.

## Notes

- The demo catalogue is **intentionally excluded** from this barrel. It lives behind a separate path (`@modules/products/demo`) so that "what a sibling may import" and "what is the production API" remain the same question. `eslint-plugin-boundaries` restricts that second door to seeders only.
- Adding a new export here is treated as a cross-module API commitment — the file's own comment frames each export as "a promise … that this shape will not move."
- The file is a pure re-export; all logic lives in `./service`, `./repository`, `./model`, and `./events`.
