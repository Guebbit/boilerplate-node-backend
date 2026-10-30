---
source: src/modules/products/module.ts
sha256: f41d33aea022e6813d26c8a26a5e1387bd23be1ee1da165f7526ca98d5359943
generated_at: 2026-10-29T05:27:05.060000+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/module.ts

## Purpose

Manifest file for the **products** module — the product catalogue (public read, admin write, soft-delete with restore). It registers the module's routes, config, locales, image pipeline, translatable fields, browser-event schemas, scenario subjects, and personal-data classification with the kernel registry. The module is deliberately a **leaf**: it emits domain events (`product.deleted`, `product.created`) rather than importing sibling modules, so downstream contexts (cart, orders, stock) conform to its model without creating circular dependencies.

## Key elements

- **`export default` (satisfies `AppModule`)** — the single manifest object consumed by the kernel. Fields:
  - `name` — registry key `'products'`.
  - `mounts` — mounts the router at `/products`.
  - `config` — slices `productsConfig`; the VAT-rate resolution lives here (orders only freeze the number it hands back).
  - `locales` — path to the `locales/` directory alongside this file.
  - `imageTargets.products.writeback` — delegates image write-back to `productRepository.writebackImage`.
  - `translatables.product` — declares `title`/`description` as a *derived* index column (not primary data), points to the `products` collection and `products` cache tag, and plugs in `checkProductTranslationFields` from `model.ts`.
  - `scenario.shop` — an ordered list of 11 named product rows (softDeleted, inactive, offSale, outOfStock, barebones, inStock, rich, digital, lowStock, noWithdrawal, heavy) that serve as canonical fixtures for integration tests and the storefront's branch logic.
  - `browserEvents` — re-exports `productsBrowserEvents`; shapes documented in `openapi.browser-events.yaml`.
  - `personalData` — set to `'none'`; order lines embed their own frozen snapshot, so no PII export belongs here.

## Relationships

- **`src/kernel/registry.ts`** — provides the `AppModule` type that this file's default export must satisfy.
- **`src/modules.ts`** — aggregates this module into the application's module list.
- **`./routes.ts`** — imported; supplies the router mounted at `/products`.
- **`./repository.ts`** — imported; supplies `writebackImage` and `translatable` helpers referenced in the manifest.
- **`./model.ts`** — imported; supplies `checkProductTranslationFields` for the translatables block.
- **`./config.ts`** — imported; supplies `productsConfig` (sliced into the manifest).
- **`./browser-events.ts`** — imported; supplies `productsBrowserEvents`.
- **`./events.ts`** — side-effect import (`import './events'`); registers `product.created` / `product.deleted` event definitions.
- **`src/modules/invoicing/tests/integration/*`** — integration tests that exercise the products catalogue as a prerequisite (e.g., creating products before issuing invoices or credit notes).
- **`src/modules/products/tests/unit/config.test.ts`** — unit-tests the config exported by `./config.ts`.

## Notes

- **Stock counters are foreign.** `onHand` and `reserved` are declared on the product document but written **only** by the `inventory` module. This module never mutates them. `inventory` receives the product's identity via the `product.created` event it already subscribes to, avoiding a reverse import.
- **Translatable fields are derived, not source-of-truth.** `title`/`description` exist on the document solely so Mongo can index and sort; the authoritative values live in the translation collection. Updating a translation must clear the `products` cache tag.
- **Scenario rows are load-bearing.** The 11 names in `scenario.shop` are pinned by `scenarios/subjects.ts` and asserted in `tests/integration/scenarios/shop.test.ts`. Renaming or removing one breaks those tests silently unless you update both.
- **`digital` and `noWithdrawal` encode legal/business rules.** `digital` triggers the `requiresShipping: false` branch in orders/delivery; `noWithdrawal` marks a made-to-order row (EU Art. 16(c)) that `returns` must refuse. These are not arbitrary fixtures.
