---
source: src/modules/products/module.ts
sha256: da1cacd73cf0d376819164b7789ef82fec01baae9cb07560dfd50344ef36af58
generated_at: 2026-11-14T21:24:41.104006+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/module.ts

## Purpose

Module manifest that registers the **products** catalogue with the application kernel: mounts its HTTP routes, declares its config, translation rules, image pipeline, scenario fixtures, and browser-event schemas. It is a leaf module — it emits domain events rather than importing sibling modules, and it never writes stock counters itself (those belong to `inventory`).

## Key elements

- **Default export** — an object typed as `AppModule` (satisfies `@kernel/registry`). This is the single registration surface the kernel reads.
- **`mounts`** — attaches `router` (from `./routes`) at the base path `/products`.
- **`config`** — exposes `productsConfig.slice` so the kernel can gate VAT-rate lookups; the catalogue resolves a tax class into a rate, and `orders` merely freezes the resulting number.
- **`imageTargets.products.writeback`** — delegates to `productRepository.writebackImage` for post-upload image processing.
- **`translatables.product`** — wires the `products` collection, the `products` cache tag, the repository's translatable adapter, and `productTranslationFieldRules` (from `./model`). `title`/`description` are derived index columns, not stored product data.
- **`scenario.shop`** — enumerates 11 canonical product IDs (`softDeleted`, `inactive`, `offSale`, `outOfStock`, `barebones`, `inStock`, `rich`, `digital`, `lowStock`, `noWithdrawal`, `heavy`) that other modules' integration tests branch against.
- **`browserEvents`** — exposes `productsBrowserEvents` (from `./browser-events`) for the analytics relay.
- **`personalData: 'none'`** — the catalogue is public; per-user snapshots live on order lines owned by `orders`.
- **Side-effect import of `./events`** — registers event definitions without importing any symbol.

## Relationships

- **`src/kernel/registry.ts`** — provides the `AppModule` type that the default export satisfies.
- **`src/modules.ts`** — aggregates this module's default export into the application's module list.
- **`src/modules/products/routes.ts`** — supplies the `router` that gets mounted at `/products`.
- **`src/modules/products/repository.ts`** — provides `writebackImage` and the translatable adapter used in the manifest.
- **`src/modules/products/model.ts`** — provides `productTranslationFieldRules` for the translation config.
- **`src/modules/products/config.ts`** — provides `productsConfig` (VAT-rate slice).
- **`src/modules/products/browser-events.ts`** — provides the `productsBrowserEvents` schema.
- **`src/modules/products/events.ts`** — side-effect import; registers the product domain event definitions that downstream modules subscribe to.
- **`src/modules/invoicing/tests/integration/*.test.ts`** — integration tests that exercise the scenario products this manifest declares.
- **`src/modules/stats/tests/integration/stats.test.ts`** — integration test that depends on the scenario catalogue defined here.
- **`src/modules/products/tests/unit/config.test.ts`** — unit test for the `productsConfig` slice exposed in the manifest.

## Notes

- **Stock is never touched here.** `onHand` and `reserved` are declared on the product document but written exclusively by `inventory`, which subscribes to the module's creation event to seed an opening count. This module intentionally avoids importing `inventory` to stay a leaf.
- **Scenario IDs are contractual.** The 11 IDs in `scenario.shop` are pinned in `scenarios/subjects.ts` and asserted by `tests/integration/scenarios/shop.test.ts`. Renaming or removing one breaks downstream module tests (invoicing, stats, delivery).
- **Translation index columns.** `title` and `description` in `translatables` exist solely so Mongo can sort/index; they are derived from a translation write, not independent product fields.
- **`personalData: 'none'` is deliberate.** An order line embeds a frozen snapshot of the product; exporting that snapshot is `orders`' responsibility, not the catalogue's.
