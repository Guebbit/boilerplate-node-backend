---
source: src/modules/products/module.ts
sha256: 7df7350616138a7cdfc4a4185b7700f36bcc725ced582a4c39656de2274a5c9e
generated_at: 2026-09-23T19:27:26.636973+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/module.ts

## Purpose

Module manifest for the product catalogue. Declares the module's identity (name, base path), its permission keys, routes, configuration gates, translatable fields, image pipeline, and test-scenario subjects in a single object that satisfies the kernel's `AppModule` contract. It is the static registration surface the kernel and downstream tooling read when wiring up the products context.

## Key elements

- **Default export** – A `satisfies AppModule` object with:
  - `name` / `basePath` – Module identity (`products`, `/products`).
  - `permissions` – Five RBAC keys (`products.self.read` … `products.any.delete`). Deleting the module must remove these from the shared permission file (enforced by `tests/cross-cutting/module-permissions.test.ts`).
  - `routes` – The Hono router imported from `./routes`.
  - `requiredConfig` – Two env vars (`NODE_VAT_RATE_DEFAULT`, `NODE_VAT_RATE_REDUCED`); the catalogue owns tax-rate resolution.
  - `customCheck` – `invalidVatRateConfig` from `./config`; catches non-numeric or out-of-range rates that `requiredConfig`'s empty-string check misses.
  - `locales` – Path to the module's locale directory.
  - `imageTargets` – Wires `productRepository.writebackImage` as the image-pipeline writeback for the `products` target.
  - `translatables` – Declares `title` / `description` as derived index columns on the `products` collection with cache tag `products`.
  - `scenario.shop` – Six test subjects (`softDeleted`, `inactive`, `outOfStock`, `barebones`, `inStock`, `rich`) that storefront and repository tests must cover.
  - `personalData: 'none'` – Catalogue rows are not person-scoped; order-line snapshots belong to `orders`.

## Relationships

- **`src/kernel/registry.ts`** – Imports the `AppModule` type; the manifest is validated against it at registration time.
- **`src/modules.ts`** – Aggregates this module (and its siblings) for the kernel's boot sequence.
- **`./routes.ts`** – Provides the `router` instance attached to the manifest.
- **`./repository.ts`** – Provides `productRepository.writebackImage` used in `imageTargets`.
- **`./config.ts`** – Exports `invalidVatRateConfig`, the `customCheck` callback.
- **`./events.ts`** – Side-effect import; registers `product.created` / `product.deleted` listeners so the module stays a leaf (no sibling imports).
- **`./openapi.yaml`** – API contract for the routes declared here (referenced in docs, not imported at runtime).
- **Downstream tests** (`cart`, `orders`, `payments`, `products` test suites) – Exercise the scenarios, permissions, and config gates defined in this manifest.

## Notes

- **Leaf-module invariant.** This file must not import another sibling's service or repository. Cross-module effects flow through events (`product.created`, `product.deleted`) or the `AppModule` manifest fields (e.g. `imageTargets`, `translatables`). Adding a direct import of a sibling breaks the dependency direction and the "everything downstream is a statement about a product" rule in the docblock.
- **`onHand` / `reserved`.** Declared on the product document but written *only* by the `inventory` module (including the opening count triggered by `product.created`). This module never increments or decrements either counter.
- **VAT ownership.** The catalogue resolves a tax class into a concrete rate (`resolveTaxRate`); `orders` merely freezes the number it receives. Changing a rate is a `products` config change, not an `orders` one.
- **`scenario.shop` ordering.** The first four entries are "hidden or empty" cases; `inStock` and `rich` are the two ordinary rows a UI screen needs. `scenarios/subjects.ts` pins the concrete document behind each label.
