---
source: src/modules/stats/module.ts
source_sha256: c6fd909a4d80514ee8069adc0226ff08441132d8eec9de33795c98d691fae651
context_sha256: 4274aade466c8eb7167c637e56aafd6b508eacc416125b87383a812c72bdd4ed
generated_at: 2026-11-22T07:51:18.792027+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stats/module.ts

## Purpose
Manifest entry for the `stats` module, which provides the sales numbers behind the staff dashboard. Figures are composed on read from other modules; nothing is stored or precomputed. This file registers the module with the kernel, mounting its routes and declaring its locales and personal-data stance.

## Key elements
- **Default export** – an object satisfying `AppModule` (from `@kernel/registry`):
  - `name: 'stats'`
  - `mounts: [{ basePath: '/stats', routes: router }]` – mounts the router from `./routes` at `/stats`.
  - `personalData: []` – declares no personal data (all figures are aggregates; customers are counted by id).
  - `locales` – path to the `locales` directory next to this file (`path.join(__dirname, 'locales')`).

## Relationships
- **`src/kernel/registry.ts`** – provides the `AppModule` type that the manifest must satisfy.
- **`src/modules/stats/routes.ts`** – supplies `router`, mounted at `/stats`.
- **`src/modules.ts`** – the module list that registers manifests like this one (inferred from its role as a neighbor; the file itself doesn't import it).
- **`src/modules/payments/module.ts`, `src/modules/returns/module.ts`, `src/modules/shop/module.ts`** – sibling module manifests. Per the header comment, `stats` depends on `payments` and `returns` (plus `invoicing` and `orders`), each through its own barrel, and days follow `NODE_SHOP_TIMEZONE`, which `shop` owns. This file doesn't import them directly.

## Notes
- Owns no collection and no cache; every money figure comes from `invoicing`, and dependencies are expected to return already-grouped answers.
- Has no config of its own.
- Uses `satisfies AppModule`, so the literal type is preserved while still being type-checked.
