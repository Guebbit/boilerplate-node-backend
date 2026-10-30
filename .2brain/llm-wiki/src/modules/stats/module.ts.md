---
source: src/modules/stats/module.ts
sha256: 74ada9c3300bf6cc59a5b96cebc7d9bd2eff965c9113910f95dceaad528df85f
generated_at: 2026-10-29T05:55:28.372140+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/module.ts

## Purpose
Module manifest for the **stats** module. It registers the sales-dashboard routes under `/stats` and declares the module's metadata (name, no personal data, locale path) so the kernel can discover and mount it. No business logic lives here; the actual figures are composed on read from other modules' barrels.

## Key elements
- **`default` export** – An object typed as `AppModule` (satisfies the constraint from `@kernel/registry`). Contains:
  - `name: 'stats'`
  - `mounts` – a single entry that mounts the imported `router` at `/stats`.
  - `personalData: []` – explicit declaration that nothing stored is personal.
  - `locales` – path to `locales/` relative to this file.
- **`router` import** – Pulled from `./routes`; this file merely re-exports it as the mount target.

## Relationships
- **`src/kernel/registry.ts`** – Provides the `AppModule` type used in the `satisfies` check; this file conforms to that contract.
- **`src/modules.ts`** – The top-level module registry that imports this file's default export to assemble the application's module list.
- **`src/modules/stats/routes.ts`** – Source of the `router` value mounted here; contains the actual `/stats` route handlers that compose figures from `invoicing`, `orders`, `payments`, and `returns` barrels.

## Notes
- The file owns **no data**. There is no collection, cache, or precomputation—every number is assembled at request time by the routes.
- Timezone-aware "days" figures follow `NODE_SHOP_TIMEZONE`, a setting owned by the `shop` module, not here.
- The `satisfies AppModule` check validates the shape without widening the type, so adding a field not on `AppModule` will fail compilation.
