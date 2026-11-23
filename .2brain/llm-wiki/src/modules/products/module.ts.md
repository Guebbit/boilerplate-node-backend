---
source: src/modules/products/module.ts
source_sha256: cfb2605577cfea424b554a3f40726ccdd36df8004d11abd462790fd53655e7ca
context_sha256: 4770a78679eaa0fb558ad8d8c4e831fb321d1db7ec6fa5e0a5ce60d1732289f0
generated_at: 2026-11-22T07:10:35.434378+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/module.ts

## Purpose
Manifest entry for the `products` module: the product catalogue (public read, admin write, soft delete with restore). Other contexts (cart, orders, stock) conform to this model. It reads only `shop` and communicates with siblings by emitting `product.deleted` and `product.created` rather than importing them. It holds no stock; `inventory` owns counts and uses `product.created` to give a new product its opening count.

## Key elements
- **Default export** – an object `satisfies AppModule` (type from `@kernel/registry`) with these fields:
  - `name: 'products'`
  - `mounts` – mounts the `router` from `./routes` at `/products`.
  - `config` – `[productsConfig.slice]`. The VAT rates are this module's config because the catalogue resolves a product's tax class into a rate.
  - `locales` – the `locales` directory next to the file.
  - `imageTargets` – `products`, with `productRepository.writebackImage` as the writeback.
  - `translatables` – the `product` entry: collection and cache tag are both `products`. It spreads `productRepository.translatable` and applies `productTranslationFieldRules` from `./model`.
  - `scenario.shop` – the list of product states the scenario/seed layer must provide: `softDeleted`, `inactive`, `offSale`, `outOfStock`, `barebones`, `inStock`, `rich`, `digital`, `lowStock`, `noWithdrawal`, `heavy`.
  - `browserEvents` – `productsBrowserEvents`.
  - `personalData: 'none'`

## Relationships
- `src/kernel/registry.ts`: supplies the `AppModule` type that the manifest must satisfy.
- `src/modules.ts`: the module list that picks up this manifest.
- `./routes`, `./repository`, `./model`, `./config`, `./browser-events`: this file wires in their exports, namely the router, writeback and translatable hooks, translation field rules, config slice and browser-event definitions.
- `src/modules/inventory/module.ts` and `src/modules/orders/module.ts`: sibling modules that interact with products through events and the frozen tax rate, not through imports.
- The invoicing integration tests (`correct-invoice`, `credit-note-catch-up`, `issue-credit-note`, `issue-invoice`, `reencrypt`, `retention`) are graph neighbours. They exercise the module in a running app.

## Notes
- The `title` and `description` columns of a translated product are a derived index column, kept only so Mongo can sort and index on them. They are not the product's own data.
- Scenario subject meanings:
  - `digital`: the one row with `requiresShipping: false`.
  - `lowStock`: one unit, on no seeded order. It is the subject of the last-unit race.
  - `noWithdrawal`: made-to-order (EU Art. 16(c)); `returns` refuses its lines.
  - `heavy`: over the express weight ceiling but within standard's.
- `scenarios/subjects.ts` pins the row behind each scenario, and `tests/integration/scenarios/shop.test.ts` verifies each has its property.
- `orders` only freezes the rate that `resolveTaxRate` returns. It does not own the VAT config.
- An order line embeds its own frozen product snapshot, so exporting that copy is `orders`' responsibility. This module has no personal data.
- Browser events arrive through `analytics`' relay. Their shapes are in `openapi.browser-events.yaml`.
