---
source: src/modules/products/module.ts
sha256: 11c489007f1e28e4b857c69786b902e560b60edc30ec1e394e21e610fb737006
generated_at: 2026-10-15T11:42:42.357392+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/module.ts

## Purpose

Module manifest (registration entry) for the product catalogue. It wires together the module's routes, repository, config, events, and browser-event declarations into a single `AppModule` object consumed by the kernel. The catalogue is a leaf module: public read, admin write, soft-delete with restore — it coordinates with siblings (inventory, orders, delivery) purely through emitted events and shared document fields, never by importing them back.

## Key elements

- **Default export (`AppModule`)** — the manifest object satisfying the `AppModule` type from `@kernel/registry`. Contains `name`, `basePath` (`/products`), `routes`, `config`, `locales`, `imageTargets`, `translatables`, `scenario`, `browserEvents`, and `personalData`.
- **`routes`** — imported from `./routes`; mounted at `/products`.
- **`config: [productsConfig.slice]`** — imports from `./config`; the VAT/tax-rate slice this module owns (orders only freeze the resolved number).
- **`imageTargets.products.writeback`** — bound to `productRepository.writebackImage`; the kernel calls this after an image upload.
- **`translatables.product`** — declares `title`/`description` as *derived* index columns (not source data). Provides `existsById`, `writeTranslatedFields`, `markEdited`, and `checkFields` callbacks to the translation pipeline.
- **`scenario.shop`** — array of 11 subject IDs (softDeleted, inactive, offSale, outOfStock, barebones, inStock, rich, digital, lowStock, noWithdrawal, heavy) that pin the rows the storefront and repository branches depend on.
- **`browserEvents`** — imported from `./browser-events`; request shapes documented in `openapi.yaml`.
- **`personalData: 'none'`** — the catalogue is public; per-order snapshots belong to `orders`, not here.
- **Side-effect import `./events`** — registers `product.created` and `product.deleted` event definitions with the kernel.

## Relationships

- **`src/kernel/registry.ts`** — provides the `AppModule` type used in the `satisfies` clause; the kernel reads this manifest to mount routes, config slices, locales, and event handlers.
- **`src/modules.ts`** — registers this module's default export into the application's module list.
- **`src/modules/products/routes.ts`** — source of the `router` value passed into the manifest.
- **`src/modules/products/repository.ts`** — source of `productRepository` (image writeback, existence check, translation writeback, mark-edited).
- **`src/modules/products/model.ts`** — source of `checkProductTranslationFields`, the validator the translation pipeline calls before writing.
- **`src/modules/products/config.ts`** — source of `productsConfig` (VAT rate slice).
- **`src/modules/products/browser-events.ts`** — source of the `productsBrowserEvents` array.
- **`src/modules/products/events.ts`** — side-effect import; declares `product.created` / `product.deleted` so inventory and other listeners can subscribe without this module importing them.
- **`src/modules/products/openapi.yaml`** — documents the browser-event request shapes referenced in comments.
- **Invoicing / stats / conditional-writes integration tests** — exercise the catalogue's products (e.g. soft-deleted, in-stock) as fixtures; they depend on the scenario subjects declared here.
- **`src/modules/products/tests/unit/config.test.ts`** — unit-tests the config slice this manifest exposes.

## Notes

- `onHand` and `reserved` are declared on the product document but written **exclusively** by the `inventory` module. This module never mutates those counters; `product.created` is the mechanism by which inventory initialises stock on a new product without a circular import.
- The `translatables` fields (`title`, `description`) are *derived* sort/index columns, not the canonical source of truth for a product's name/description — the collection and cache-tag both point to `products`.
- Scenario subject IDs are the contract between this manifest and `tests/integration/scenarios/shop.test.ts`; renaming or removing an ID here breaks that test without a TypeScript error.
- The module deliberately has **no** outbound imports of sibling feature modules (orders, delivery, inventory) to stay a leaf in the dependency graph; all cross-module coupling flows through events or shared document fields.
