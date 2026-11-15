---
source: src/modules/inventory/module.ts
sha256: b4eba395f4ce3a5356ef66a0b3a46777d784c5e8db3ef16632bdffd393a4b24a
generated_at: 2026-11-14T20:04:31.486115+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/module.ts

## Purpose

Module registration file for the **inventory** domain. It wires the inventory module into the application kernel: declares its name, HTTP mount, background jobs, config schema, event subscriptions, locales, and personal-data policy. It also defines *when* inventory reacts to external domain events (product lifecycle, payment-driven stock movements) without importing the emitting modules directly.

## Key elements

- **Default export** — an `AppModule` object (`satisfies AppModule`) containing:
  - `name: 'inventory'`
  - `mounts` — mounts `./routes` under the `/inventory` base path.
  - `jobs` — registers `inventoryJobs` from `./jobs`.
  - `config` — exposes `inventoryConfig.slice` from `./config`.
  - `subscribe()` — registers four `onDomainEvent` handlers (see below).
  - `locales` — points to a `locales/` directory relative to this file.
  - `personalData: 'none'` — no personal data is stored; movements are keyed by product and order, never by person.
- **`subscribe()` handlers**
  - `PRODUCT_CREATED` → calls `openLevel(productId)` to create a zero-stock row so the product appears on the stock board and low-stock gauge.
  - `PRODUCT_DELETED` → calls `removeLevel(productId)` **only** when `hardDelete` is true; soft deletes intentionally leave counters intact for restoration.
  - `PREORDER_ALLOCATED` → calls `refreshStockCacheForProducts([productId])` to sync the catalogue copy after a payment commits inside the payer's transaction.
  - `STOCK_RETAKEN` → same refresh for a late payment that re-claims a previously released hold.
- **Side-effect import of `./metrics`** — registers two domain gauges with the metrics registry at module load time.

## Relationships

- **`@kernel/registry` (`src/kernel/registry.ts`)** — imports the `AppModule` type to satisfy the module interface contract.
- **`@kernel/events` (`src/kernel/events.ts`)** — imports `onDomainEvent` to subscribe to cross-module domain events.
- **`@modules/products`** — imports `PRODUCT_CREATED` and `PRODUCT_DELETED` event constants (the module *listens* to products, never the reverse, to keep the dependency graph acyclic).
- **`./routes`** — provides the `router` instance mounted at `/inventory`.
- **`./services/levels`** — provides `openLevel` / `removeLevel` for the product-lifecycle subscriptions.
- **`./services/transition`** — provides `refreshStockCacheForProducts` used by the payment-related event handlers.
- **`./events`** — source of the module's own domain events `PREORDER_ALLOCATED` and `STOCK_RETAKEN`.
- **`./config`**, **`./jobs`**, **`./metrics`** — imported for their registration side-effects or values.
- **`src/modules.ts`** — the global module manifest that includes this file's default export.
- **Tests** — `src/modules/inventory/tests/integration/opening-stock.test.ts` exercises the `PRODUCT_CREATED` → `openLevel` path; `src/modules/inventory/tests/integration/preorder-cache.test.ts` exercises the `PREORDER_ALLOCATED` / `STOCK_RETAKEN` cache-refresh path.

## Notes

- The module **cannot** be imported by `products` (would create a dependency cycle enforced by `.dependency-cruiser.cjs`). All cross-module communication therefore goes through domain events.
- `openLevel` creates the row at **zero** on purpose: a zero-stock product must still be visible on the stock board and the low-stock gauge. No stock is booked at creation; units enter only via an explicit `receive`.
- The `PRODUCT_DELETED` handler deliberately ignores soft deletes so that counters remain restorable.
- `PREORDER_ALLOCATED` / `STOCK_RETAKEN` fire *after* the payer's transaction commits, because the catalogue copy (owned by `products`) cannot be written inside the payer's transaction without breaking rollback semantics. The cache refresh is therefore eventually consistent.
- No entry in `scenarios/index.ts`: a hold only exists post-checkout, so a seeded one would represent an unreachable state. Reservations are also never serialized to a client.
