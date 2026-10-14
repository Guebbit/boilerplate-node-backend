---
source: src/modules/inventory/module.ts
sha256: 195c269b8d3ce67e5e34c39d40d5becafeb30472e04547c95afe3df30e41f032
generated_at: 2026-10-14T15:55:33.114045+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/module.ts

## Purpose
Module manifest for inventory. Wires the module's HTTP routes, domain-event subscriptions, metrics gauges, and config into a single `AppModule` object that the kernel registry loads at boot. All cross-module communication flows through domain events rather than direct imports, keeping the dependency graph acyclic.

## Key elements
- **Default export** — the `AppModule` object (name `inventory`, basePath `/inventory`, `personalData: 'none'`).
- **`subscribe()`** — registers two domain-event handlers:
  - `PRODUCT_CREATED` → calls `openLevel(productId, onHand)`. Creates the stock-level row *regardless* of quantity (a zero-stock product must still appear on the board and low-stock gauge); books units only when the row was actually inserted, so an outbox redelivery cannot double them.
  - `PRODUCT_DELETED` → calls `removeLevel(productId)` **only** when `hardDelete` is true. Soft deletes deliberately leave counters intact so a restore has a known state.
- **Side-effect imports** — `import './events'` (registers the module's own event handlers) and `import './metrics'` (registers the two domain gauges with the metrics registry at load time).
- **`config`** — exposes `inventoryConfig.slice` for the kernel config system.
- **`locales`** — points to the module's locale directory for i18n strings.

## Relationships
- **`src/kernel/registry.ts`** — the export `satisfies AppModule`, so this file is a first-class citizen the registry discovers and boots.
- **`src/kernel/events.ts`** — `onDomainEvent` is the subscription primitive used inside `subscribe()`.
- **`src/modules/products/index.ts`** — source of the `PRODUCT_CREATED` / `PRODUCT_DELETED` event constants. Inventory also *reads* product titles for shortfall messages, but products never imports inventory back (acyclicity constraint enforced by `.dependency-cruiser.cjs`).
- **`src/modules/inventory/routes.ts`** — its `router` becomes the module's HTTP surface under `/inventory`.
- **`src/modules/inventory/services/index.ts`** — provides `openLevel` and `removeLevel`, the two counter mutations triggered by product lifecycle events.
- **`src/modules/inventory/config.ts`** — supplies `inventoryConfig` consumed by the kernel's config slice mechanism.
- **`src/modules.ts`** — parent barrel that (indirectly) pulls this module into the application's module list.

## Notes
- **No `scenarios` entry.** A reservation/hold only exists after a checkout; a seeded one would represent an unreachable state. Reservations are also never serialized to a client.
- **Idempotency of opening stock.** `openLevel` books units only on *insert*, not on upsert. If the outbox redelivers `PRODUCT_CREATED`, the row already exists and no units are re-booked.
- **Soft vs. hard delete.** A soft delete (or restore) must not touch the counters; only `hardDelete: true` triggers `removeLevel`. Getting this wrong would corrupt the "where a restore has to come back to" invariant.
- **Acyclic graph.** Products cannot `import { openLevel } from 'inventory'`; it emits an event instead. Any new cross-module call must follow the same pattern.
