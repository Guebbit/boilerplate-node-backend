---
source: src/modules/products/module.ts
sha256: f41d33aea022e6813d26c8a26a5e1387bd23be1ee1da165f7526ca98d5359943
generated_at: 2026-11-08T07:45:10.578031+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/module.ts

## Purpose

The manifest (entry point) for the **products** catalogue module. It declares the module's identity, mounted routes, configuration gate, translation schema, image pipeline, seeded test scenarios, and browser-event contract — all in a single `AppModule`-typed default export so the kernel can register and wire the module without the module importing its siblings.

## Key elements

- **Default export (`AppModule`)** — the module manifest object, type-checked with `satisfies AppModule`.
- **`mounts`** — registers the HTTP router at `/products`.
- **`config`** — exposes the module's VAT-rate slice; the catalogue resolves tax classes into rates that `orders` later freezes.
- **`locales`** — path to the module's locale directory.
- **`imageTargets`** — declares a `products` target whose `writeback` callback delegates to `productRepository.writebackImage`.
- **`translatables.product`** — defines `title`/`description` as the derived (indexed) translation fields on the `products` collection, with `productRepository.translatable` spread in and `checkProductTranslationFields` as the field validator.
- **`scenario.shop`** — enumerates 11 seeded product fixtures (soft-deleted, inactive, off-sale, out-of-stock, barebones, in-stock, rich, digital, low-stock, no-withdrawal, heavy) that integration tests must find by name.
- **`browserEvents`** — the event shapes the storefront reports through the analytics relay.
- **`personalData`** — set to `'none'`; no field here is person-scoped.
- **Side-effect import of `./events`** — registers the `product.created` / `product.deleted` domain events so sibling modules can subscribe without a direct import.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/registry.ts` | Imports the `AppModule` type used in the `satisfies` constraint. |
| `src/modules/products/routes.ts` | Imports the `router` instance for the `mounts` entry. |
| `src/modules/products/repository.ts` | Imports `productRepository` for the image `writeback` and the `translatable` config spread. |
| `src/modules/products/model.ts` | Imports `checkProductTranslationFields` as the translation field validator. |
| `src/modules/products/config.ts` | Imports `productsConfig` to expose its slice as the module's config gate. |
| `src/modules/products/browser-events.ts` | Imports `productsBrowserEvents` for the `browserEvents` field. |
| `src/modules/products/events.ts` | Side-effect import; registers domain events (`product.created`, `product.deleted`) on the kernel event bus. |

## Notes

- **Leaf discipline.** The module deliberately never imports a sibling. Inventory writes `onHand`/`reserved` by subscribing to `product.created`; this module never touches those counters. Any new cross-module need should go through an event, not an import.
- **Translatable fields are derived.** `title` and `description` exist only so Mongo can sort/index; the source-of-truth translations live in the `products` collection and clear the `products` cache tag on write.
- **Scenario list is load-bearing.** Integration tests (`scenarios/shop.test.ts`) assert each named fixture actually carries its stated property. Adding or removing an entry here without updating the seed data or tests will break the suite silently.
- **Config ownership.** Tax *rates* belong to this module; `orders` only records the frozen number `resolveTaxRate` returned. Don't move rate logic downstream.
