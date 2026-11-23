---
source: src/modules/shop/module.ts
source_sha256: f43a7af28b506f3cd78b2d2745e57eabea3fa08c330d8aa0efc001f12c85e562
context_sha256: 0a8ac829673681d27b4bbadb35d8e46c47abca009e642c6f9c4bdc10427c31b3
generated_at: 2026-11-22T07:47:06.183858+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop/module.ts

## Purpose
Declares the `shop` module's manifest entry for the kernel registry. The module publishes the shop's own settings once, mounts one public route, and contributes the config slice that is checked at the boot gate: the time zone is required, and so is the operator's phone, which `account` leaves optional (the withdrawal notice prints it).

## Key elements
- **Default export**: an object checked with `satisfies AppModule`, with these fields:
  - `name: 'shop'`
  - `mounts`: a single entry, `{ basePath: '/shop', routes: router }`
  - `config`: `[shopConfig.slice]`, the module's config gate
  - `personalData: 'none'`, because the module has no collection and holds only the deployer's own configuration
- **`router`** (from `./routes`): the route set mounted at `/shop`.
- **`shopConfig`** (from `./config`): its `slice` is registered as the module's config.

## Relationships
- `src/kernel/registry.ts`: provides the `AppModule` type that the manifest must satisfy.
- `src/modules/shop/routes.ts`: supplies the `router` mounted at `/shop`.
- `src/modules/shop/config.ts`: supplies `shopConfig`, whose `slice` becomes the module's `config`. `src/modules/shop/tests/unit/config.test.ts` tests this config.
- `src/modules.ts` and the other module manifests (`inventory`, `invoicing`, `orders`, `payments`, `products`, `returns`, `shop-tasks`, `stats`) are graph neighbors. This file does not import them. They sit alongside it in the module set, which is presumably collected in `src/modules.ts`.

## Notes
- The module is declarative only. It has no logic and no persistence.
