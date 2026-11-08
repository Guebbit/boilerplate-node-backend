---
source: src/modules/orders/index.ts
sha256: a3fb755f29bdbf49317ff6fa00f9622a3cb24d81d5118617c61cdf2d0e1af917
generated_at: 2026-11-08T06:52:18.084044+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/index.ts

## Purpose

Public barrel for the orders module. Per the strategic DDD rule (docs/theory/strategic-ddd.md §5), this is the **only** import surface a sibling module is allowed to use. It re-exports the module's services, domain, events, emails, and model types so callers never reach into internal files directly.

## Key elements

- `export * from './services'` — exposes order services (including `orderService.placeOrder`, the sole function that writes a new order).
- `export * from './domain'` — exposes domain logic (likely `create` and related use-cases).
- `export * from './events'` — exposes order-related domain events.
- `export * from './emails'` — exposes email notification helpers tied to order lifecycle.
- `export type * from './model'` — exposes **type-only** definitions from the order model; the runtime model and `orderRepository` remain internal.

## Relationships

- **`@modules/cart` (checkout, reorder, view, post-checkout):** Cart's checkout flow calls `orderService.placeOrder` (exported via this barrel) to persist a new order. The cart integration tests (`checkout-stock-divergence.test.ts`, `stock.test.ts`) exercise this path. Cart never touches the order repository directly.
- **`@modules/delivery` (module, presenter, services/act, actions, announce, board, cancel-remainder, cut, deliver):** Delivery imports order domain types and services from this barrel to read order state, act on cut/delivery steps, and announce status changes. The delivery `module.ts` orchestrates which order services it calls.

## Notes

- The model's **runtime** (entities, repository) is intentionally *not* re-exported here—only types. Sibling modules must go through services.
- The module's dependency **into** `@modules/users` (`personalData.erase`, `userService.getById`) lives in `module.ts`, not in this barrel. Consumers of this file do not see or manage that coupling.
- This file contains no logic of its own; it is purely a re-export surface. Any import path that bypasses it (e.g. `…/orders/services`) violates the DDD boundary rule.
