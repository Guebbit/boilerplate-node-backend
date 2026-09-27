---
source: src/modules/products/module.ts
sha256: a4edbc42bda0fe27a210e1311136212e5018c78894425d3a2509b36a26051468
generated_at: 2026-09-27T15:32:42.904937+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/module.ts

## Purpose

The manifest (registration) file for the **products** domain module. It declares the module's identity to the kernel — routes, permissions, config gates, translatable fields, image targets, and test scenarios — so the rest of the application can discover and branch on the product catalogue without importing its internals. Products is a leaf module: it emits events rather than importing sibling domains (cart, orders, inventory), making it the one reference point other contexts conform to.

## Key elements

- **Default export** — a single object satisfying `AppModule` (from `@kernel/registry`). Everything below is a field on that object.
- **`permissions`** — five RBAC keys (`products.self.read` through `products.any.delete`). Deleting the module deletes these keys; cross-cutting tests enforce the 1-to-1 mapping.
- **`requiredConfig` / `customCheck`** — two VAT-rate env vars (`NODE_VAT_RATE_DEFAULT`, `NODE_VAT_RATE_REDUCED`) must be non-empty *and* numerically valid (the `customCheck` from `./config` catches `2.2` or `abc`).
- **`routes`** — the Express router imported from `./routes`.
- **`imageTargets`** — maps the `products` image target to `productRepository.writebackImage` for async image processing.
- **`translatables.product`** — declares `title` and `description` as *derived* index columns (not the product's own data), with `productRepository.existsById` / `writeTranslatedFields` as the hooks the i18n pipeline calls.
- **`scenario.shop`** — seven named test subjects (`softDeleted`, `inactive`, `outOfStock`, `barebones`, `inStock`, `rich`, `digital`) that downstream scenario tests must find in the DB.
- **`personalData: 'none'`** — the catalogue is not user-scoped; order lines carry their own frozen snapshots.

## Relationships

- **`src/kernel/registry.ts`** — provides the `AppModule` type that this object must satisfy.
- **`src/modules.ts`** — imports this default export to register the module with the kernel.
- **`src/modules/products/routes.ts`** — supplies the `router` bound to this module's `basePath`.
- **`src/modules/products/repository.ts`** — supplies `writebackImage`, `existsById`, and `writeTranslatedFields` referenced by the manifest.
- **`src/modules/products/config.ts`** — supplies the `invalidVatRateConfig` validator used as `customCheck`.
- **`src/modules/products/events.ts`** — side-effect import; registers `product.created` / `product.deleted` event emitters so downstream modules (e.g. `inventory`) can subscribe.
- **`tests/integration/product-write.test.ts`**, **`tests/support/checkout-modules.ts`** — integration tests that exercise the routes and permissions declared here.
- **`src/modules/products/tests/unit/config.test.ts`** — unit-tests the `invalidVatRateConfig` function wired in as `customCheck`.

## Notes

- **Leaf discipline:** This module never imports a sibling domain module. Communication is one-way via emitted events. `inventory` imports *this* module to read stock counters; it does not get imported back.
- **`onHand` / `reserved`:** Declared on the product document but written *only* by `inventory` (including the opening count triggered by `product.created`). This module never mutates either counter.
- **VAT rates belong here, not to `orders`:** `resolveTaxRate` lives in this module; `orders` only freezes the number it receives.
- **`title` / `description` in `translatables`** are a derived Mongo index, not the canonical data source. The canonical strings live in the translation pipeline; this module just keeps a sortable copy.
- **Scenario subjects are a contract:** `scenarios/subjects.ts` pins a DB row behind each name, and `shop.test.ts` asserts each row truly has the property its name implies. Adding a new branch in storefront code without adding a subject here will leave it untested.
