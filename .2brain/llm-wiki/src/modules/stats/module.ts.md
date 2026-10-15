---
source: src/modules/stats/module.ts
sha256: 8df6907b160a4bd358096de8043de64bd48e7f54c070eade27f93a65cc4e2aae
generated_at: 2026-10-15T12:03:33.865366+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/module.ts

## Purpose

Module manifest for the **stats** module. It registers a read-only aggregation endpoint at `/stats` that composes sales figures on demand from the `invoicing`, `orders`, `payments`, and `returns` modules. No data is stored, cached, or precomputed here.

## Key elements

- **`default` export** — a `satisfies AppModule` object containing:
  - `name: 'stats'`
  - `basePath: '/stats'`
  - `routes` — imported Hono/Express router from `./routes`
  - `personalData: []` — deliberately empty; every value is an aggregate or an account-level count
  - `locales` — path to `src/modules/stats/locales`

## Relationships

- **`src/kernel/registry.ts`** — provides the `AppModule` type that the manifest satisfies (type-only import).
- **`src/modules/stats/routes.ts`** — source of the `router` attached to the manifest.
- **`src/modules.ts`** — module aggregator that imports this default export to register `stats` in the application.

## Notes

- The module owns **no** state or storage; all figures are delegated to other modules at read time. See `docs/modules/stats.md` for the definitions of each stat.
- Timezone for "days" windows is not configured here; it follows `NODE_SHOP_TIMEZONE`, owned by the `shop` module.
- `personalData` is an empty array by design (all values are aggregates), not an oversight.
