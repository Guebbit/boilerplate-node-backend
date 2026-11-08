---
source: src/modules/inventory/module.ts
sha256: 05954d0c4df0612840f59bdc28068eb014ad409f81c87fd1b29ca459dd1ce3c8
generated_at: 2026-11-08T06:00:10.977584+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/module.ts

## Purpose

Module registration entry point for the **inventory** module. Declares how the module mounts into the app (router, jobs, config, locales) and wires its domain-event subscriptions so that stock-level rows are created/destroyed in response to product lifecycle events and the mirrored catalogue cache is refreshed after out-of-transaction counter moves.

## Key elements

- **`export default { … } satisfies AppModule`** — the single manifest object consumed by the kernel. Fields:
  - `name: 'inventory'`
  - `mounts` — attaches `router` (from `./routes`) at `/inventory`.
  - `jobs` — registers scheduled/queued jobs from `./jobs`.
  - `config` — exposes `inventoryConfig.slice` (from `./config`) for the app's config resolver.
  - `subscribe()` — registers all domain-event handlers (see below).
  - `locales` — path to the module's i18n directory.
  - `personalData: 'none'` — asserts the module never keys data by person.
- **`subscribe()`** — four `onDomainEvent` handlers:
  - `PRODUCT_CREATED` → `openLevel(productId)` (creates a zero-stock row).
  - `PRODUCT_DELETED` → `removeLevel(productId)` only when `hardDelete` is true.
  - `PREORDER_ALLOCATED` → `refreshStockCacheForProducts([productId])`.
  - `STOCK_RETAKEN` → `refreshStockCacheForProducts(productIds)`.
- **`import './metrics'`** — side-effect import that registers the two domain gauges with the metrics registry at load time.

## Relationships

- **`src/kernel/registry.ts`** — provides the `AppModule` type that the default export must satisfy.
- **`src/kernel/events.ts`** — provides `onDomainEvent`, the subscription primitive used by every handler in `subscribe()`.
- **`src/modules.ts`** — the module loader that discovers and instantiates this default export at startup.
- **`src/modules/inventory/routes.ts`** — supplies the `router` mounted at `/inventory`.
- **`src/modules/inventory/services/levels.ts`** — provides `openLevel` / `removeLevel`, the only two calls that create or delete the `stocklevels` rows.
- **`src/modules/inventory/services/transition.ts`** — provides `refreshStockCacheForProducts`, used to synchronise the products-side mirror after out-of-transaction moves.
- **`src/modules/inventory/events.ts`** — source of the `PREORDER_ALLOCATED` and `STOCK_RETAKEN` event constants this module subscribes to.
- **`src/modules/inventory/jobs.ts`** — supplies the job definitions listed in the manifest.
- **`src/modules/inventory/config.ts`** — supplies `inventoryConfig` (sliced) into the manifest's `config` array.
- **`src/modules/inventory/metrics.ts`** — side-effect import; registers gauges without any named binding here.
- **`src/modules/inventory/tests/integration/opening-stock.test.ts`** — exercises the `PRODUCT_CREATED → openLevel` path.
- **`src/modules/inventory/tests/integration/preorder-cache.test.ts`** — exercises the `PREORDER_ALLOCATED / STOCK_RETAKEN → refreshStockCacheForProducts` paths.

## Notes

- **Acyclic dependency constraint:** this module imports from `@modules/products` but `products` must never import back. The `PRODUCT_CREATED` event is the one-way bridge; the inline comment references `.dependency-cruiser.cjs` as the enforcement point.
- **Hard vs. soft delete:** only `hardDelete: true` triggers `removeLevel`. Soft deletes and restores must leave counters untouched so a restore lands on the correct value.
- **Cache refresh is eventually consistent:** `refreshStockCacheForProducts` runs after the committing transaction has landed; the products-side copy is already stale at that point by design (see `docs/modules/inventory.md#why-products-still-carries-a-copy`).
- **No seeded scenarios:** holds/reservations are intentionally absent from `scenarios/index.ts` because they are only reachable through a real checkout flow, not seeding.
- **`openLevel` creates a zero row** — a zero-stock product must still appear on the stock board and low-stock gauge; no unit is booked at creation (stock enters only via `receive`).
