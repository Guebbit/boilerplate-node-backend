---
source: src/modules/inventory/module.ts
sha256: 05954d0c4df0612840f59bdc28068eb014ad409f81c87fd1b29ca459dd1ce3c8
generated_at: 2026-10-29T04:01:40.137877+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/module.ts

## Purpose

The inventory module's manifest entry point. Wires routes, domain-event subscriptions, background jobs, config, metrics gauges, and locales into a single `AppModule` export that the kernel registry loads. Encodes the module's external contract: which events it listens to, what it mounts, and its data-retention posture.

## Key elements

- **`export default { … } satisfies AppModule`** — the manifest. Declares the module name (`inventory`), the `/inventory` route mount, the job list, config schema slice, event subscriptions, locale directory, and `personalData: 'none'`.
- **`subscribe()`** — registers four domain-event handlers:
  - `PRODUCT_CREATED` → calls `openLevel(productId)` to create a zero-stock row.
  - `PRODUCT_DELETED` → calls `removeLevel(productId)` **only** when `hardDelete` is true.
  - `PREORDER_ALLOCATED` → calls `refreshStockCacheForProducts([productId])`.
  - `STOCK_RETAKEN` → calls `refreshStockCacheForProducts(productIds)`.
- **Side-effect import of `./metrics`** — registers the two domain gauges with the metrics registry at module-load time (no named binding used).
- **`router` from `./routes`** — the HTTP route table mounted under `/inventory`.
- **`inventoryJobs` from `./jobs`** — background job definitions attached to the manifest.
- **`inventoryConfig.slice` from `./config`** — the module's config schema fragment.

## Relationships

- **`src/kernel/registry.ts`** — provides the `AppModule` type that the default export satisfies; the kernel loads this object at startup.
- **`src/kernel/events.ts`** — provides `onDomainEvent`, the subscription primitive used inside `subscribe()`.
- **`src/modules/products`** (via `PRODUCT_CREATED`, `PRODUCT_DELETED`) — the only inbound channel from `products`; the dependency is event-based because the module graph must stay acyclic (this module already imports `products` for shortfall titles, so `products` cannot import back).
- **`src/modules/inventory/events.ts`** — source of `PREORDER_ALLOCATED` and `STOCK_RETAKEN`, the module's own outbound domain events that it also re-subscribes to for cache refresh.
- **`src/modules/inventory/services/levels.ts`** — supplies `openLevel` / `removeLevel`, the two counter-lifecycle operations invoked by the product events.
- **`src/modules/inventory/services/transition.ts`** — supplies `refreshStockCacheForProducts`, the post-commit cache reconciliation called from the preorder/retake handlers.
- **`src/modules/inventory/routes.ts`** — the router object mounted in the manifest.
- **`src/modules/inventory/jobs.ts`** — the job definitions exposed to the scheduler.
- **`src/modules/inventory/config.ts`** — the config schema fragment included in the manifest.
- **`src/modules/inventory/metrics.ts`** — side-effect import; defines and registers the two domain gauges.
- **`src/modules.ts`** — the module aggregator that collects this default export alongside other modules.
- **`src/modules/inventory/tests/integration/opening-stock.test.ts`** — exercises the `PRODUCT_CREATED → openLevel` path registered in `subscribe()`.
- **`src/modules/inventory/tests/integration/preorder-cache.test.ts`** — exercises the `PREORDER_ALLOCATED → refreshStockCacheForProducts` path.
- **`src/modules/invoicing/tests/integration/issue-credit-note.test.ts`** and **`credit-note-catch-up.test.ts`** — exercise the `STOCK_RETAKEN` handler by issuing credit notes that retake released holds.

## Notes

- **Acyclic-import constraint:** this module imports from `@modules/products` (for shortfall titles and catalogue mirroring). `products` therefore *cannot* import this module back. All `products → inventory` communication must flow through domain events, not direct calls. Enforced by `.dependency-cruiser.cjs`.
- **Soft-delete preservation:** the `PRODUCT_DELETED` handler deliberately ignores soft deletes (and their restores). Counters must remain intact so a restore returns to the correct value. Only `hardDelete: true` triggers `removeLevel`.
- **No scenario seed entry:** reservations/holds are intentionally absent from `scenarios/index.ts` — a hold only exists after a real checkout, so a seeded one would represent an unreachable state.
- **`personalData: 'none'`:** stock levels and holds are keyed by product and order, never by person, so no PII exposure is declared.
- **Cache refresh is eventual:** `PREORDER_ALLOCATED` and `STOCK_RETAKEN` fire after the payer's transaction commits; the catalogue copy on `products` may briefly be stale. This is documented as acceptable in `docs/modules/inventory.md`.
