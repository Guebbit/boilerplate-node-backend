---
source: src/modules/stats/module.ts
sha256: 74ada9c3300bf6cc59a5b96cebc7d9bd2eff965c9113910f95dceaad528df85f
generated_at: 2026-11-08T08:24:42.661223+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/module.ts

## Purpose

Module manifest that registers the **stats** module with the kernel. It declares the HTTP mount point, locale path, and data-classification metadata so the app loader can wire the sales-analytics routes into the dashboard. The file itself stores no data and performs no computation; it is purely a registration surface.

## Key elements

- **`export default`** — An object satisfying `AppModule` (from `@kernel/registry`). Fields:
  - `name: 'stats'` — the module identifier used by the registry.
  - `mounts` — a single entry binding the Hono router (imported from `./routes.ts`) to the base path `/stats`.
  - `personalData: []` — explicitly empty; all figures are aggregates keyed by account id, so no PII classification applies.
  - `locales` — path to a sibling `locales/` directory, resolved at build time via `__dirname`.

## Relationships

- **`src/kernel/registry.ts`** — Provides the `AppModule` type that the exported object must satisfy.
- **`src/modules.ts`** — Top-level aggregator that imports this default export to assemble the full module list for the application.
- **`src/modules/stats/routes.ts`** — Supplies the `router` instance that this manifest mounts at `/stats`.
- **`src/modules/stats/authorization.yaml`** — AuthZ policy consumed by the routes defined in `routes.ts`; not referenced directly by this file.
- **`src/modules/shop-tasks/module.ts`** — Sibling module in the same `modules/` tree; shares the same registry/manifest convention but is not imported by this file.

## Notes

- The doc-block header states the design intent: every figure is **composed on read** from `invoicing`, `orders`, `payments`, and `returns` barrels. There is no cache, no collection, and no precomputation in this module.
- Timezone handling is delegated to `NODE_SHOP_TIMEZONE`, which the `shop` module owns. Stats does not set or override it.
- `personalData` is an empty array, not omitted — this is a deliberate declaration that no PII rules apply, relevant to any compliance tooling that reads the manifest.
