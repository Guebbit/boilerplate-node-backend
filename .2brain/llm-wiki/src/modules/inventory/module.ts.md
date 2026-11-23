---
source: src/modules/inventory/module.ts
source_sha256: 32e0618546551bf5c7b71ed6ed043d207b304bb2b239b9a636944fc1ec0ebc70
context_sha256: 10499961606daeefcaf9fd21fa2b77e8c789bb6d34a5676fa9c380ccaca4c6df
generated_at: 2026-11-22T05:19:51.537581+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/module.ts

## Purpose
Manifest entry for the `inventory` module. It declares the module's HTTP mounts, background jobs, config slice, locales and personal-data stance. It also registers domain-event subscribers that keep stock levels and the cached availability answers in step with product lifecycle events. Stock counters live in the module's own `stocklevels` collection.

## Key elements
- **Default export** (`satisfies AppModule`): the module manifest with these fields:
  - `name: 'inventory'`.
  - `mounts`: `/inventory` → `router`, then `/products` → `availabilityRouter`. `/inventory` must stay first because `security.ts` reads the first mount's base path for `rawBodyPaths`.
  - `jobs`: `inventoryJobs`.
  - `config`: `[inventoryConfig.slice]`.
  - `locales`: the `locales` directory next to the file.
  - `personalData: 'none'`: movements and holds are keyed by product and order, never by person.
- **`subscribe()`**: wires `onDomainEvent` handlers:
  - `PRODUCT_CREATED` → `openLevel(productId)`. This creates a zero-stock row, books no unit and records no audit context.
  - `PRODUCT_DELETED` → `removeLevel` only when `hardDelete` is true (a soft delete or restore leaves the counters alone). It then calls `forgetAvailability([productId])` in both cases.
  - `PRODUCT_TERMS_CHANGED` → `forgetAvailability([productId])`.
  - `PREORDER_ALLOCATED` → `forgetAvailability([productId])`.
  - `STOCK_RETAKEN` → `forgetAvailability(productIds)`.
- **Side-effect import** of `./metrics`, which registers the two domain gauges at module load.

## Relationships
- `src/kernel/registry.ts`: supplies the `AppModule` type that the manifest satisfies.
- `src/kernel/events.ts`: supplies `onDomainEvent`, used for all subscriptions.
- `@modules/products`: provides `PRODUCT_CREATED`, `PRODUCT_DELETED` and `PRODUCT_TERMS_CHANGED`. Products cannot import inventory, so it emits events and inventory subscribes.
- `./events`: defines `PREORDER_ALLOCATED` and `STOCK_RETAKEN`, which this module announces and consumes itself.
- `./routes` and `./availability-routes`: supply the two routers mounted here.
- `./services/levels`: supplies `openLevel` and `removeLevel`.
- `./services/availability`: supplies `forgetAvailability`, the cache invalidation.
- `./config` supplies `inventoryConfig`, `./jobs` supplies `inventoryJobs`, and `./metrics` supplies the gauges.
- `module.yaml` sits alongside the file as a neighbor, but this file does not reference it.
- `src/modules.ts`, which lists the modules, is a neighbor, but this file does not reference it.
- The tests (`opening-stock.test.ts` and the two invoicing integration tests) are neighbors, but this file does not reference them.

## Notes
- The dependency graph must stay acyclic (see `.dependency-cruiser.cjs`). This is why new-product stock arrives through the `PRODUCT_CREATED` event rather than a direct call.
- Cache invalidation after `PREORDER_ALLOCATED` and `STOCK_RETAKEN` is deliberately event-driven. Those counter moves happen inside the payer's transaction, where the cache entry cannot be deleted because the deletion would not roll back. The entry is cleared after commit and is eventually consistent, bounded by the entry's own 60 seconds.
- A zero-stock level row is still created so the product shows up on the stock board and the low-stock gauge. Outbox redelivery finds the existing row.
- There is intentionally no `scenarios/index.ts` entry. A hold exists only after checkout, and reservations are never serialized to a client.
