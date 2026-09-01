# src/modules/products/index.ts

## Purpose

Public barrel (entry point) for the products module. It is the **only** surface a sibling module may import from; `eslint-plugin-boundaries` makes reaching internal paths like `@modules/products/service` a lint error. Keeping the surface narrow is a deliberate contract: every re-export here is a promise that the internal implementation can move without breaking consumers.

## Key elements

- **`productService`** — the main service interface, re-exported from `./service`.
- **`productRepository`** — data-access layer, re-exported from `./repository`.
- **`ProductDocument`** *(type)* — the full Mongoose document shape, re-exported from `./model`.
- **`ProductSnapshot`** *(type)* — the product's stored fields without document machinery. Published because the `orders` module's own types name it when embedding a product on each line item.
- **`productSchema` / `applyProductTransform`** — the Mongoose schema and its serialization transform, re-exported from `./model`. Needed by modules (e.g. `orders`) that **embed** a product snapshot at purchase time rather than holding a reference, so a later catalogue edit cannot rewrite order history.
- **`PRODUCT_DELETED`** — event constant re-exported from `./events`. Importing the barrel also installs the event payload declaration.

## Relationships

- **`orders` (`model.ts`, `service.ts`)** — consumes `ProductSnapshot`, `productSchema`, and `applyProductTransform` to embed a frozen product copy on each order line. This is the primary reason those symbols are exported from the barrel.
- **`cart` (`module.ts`, `services/items.ts`, `services/reorder.ts`, `services/view.ts`)** — imports `productService` / `productRepository` through this barrel to look up product data for cart operations.
- **`inventory` (`service.ts`, `metrics.ts`)** — interacts via `productService` / `productRepository` for stock-aware lookups.
- **Seeders in `cart`, `wishlist`, `orders`** — do **not** import from this barrel for demo data. They use the separate `@modules/products/demo` path, keeping this surface production-only.

## Notes

- **Demo catalogue is deliberately excluded.** It lives behind `@modules/products/demo`, and `eslint-plugin-boundaries` restricts that path to seeder files only. Do not add a demo re-export here.
- **`PRODUCT_DELETED` is side-effectful to import.** The barrel's import statement is what installs the event payload declaration; consuming modules get the type without importing `./events` directly.
- **`ProductSnapshot` ≠ `ProductDocument`.** The former is the plain stored-field shape (what `orders` embeds); the latter includes Mongoose document mechanics. Confusing them will break serialization in the orders module.
