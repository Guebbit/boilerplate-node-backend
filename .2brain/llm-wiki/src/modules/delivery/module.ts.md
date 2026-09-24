---
source: src/modules/delivery/module.ts
sha256: 5e0b22095eacbd32b660ac09fb2b4a29f09270a3c497e38858987ee7758ddd94
generated_at: 2026-09-23T18:36:39.828067+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/module.ts

## Purpose

Module manifest (entry point) for the delivery module. It declares the module's identity, permission keys, route table, personal-data collection contract, and locale directory to the kernel registry. It exists so the rest of the application can discover and mount the delivery feature without knowing its internals.

## Key elements

- **`default` export** — An `AppModule` object satisfying the kernel's manifest shape.
  - `name` / `basePath` — `'delivery'` / `'/delivery'`; used for routing and module identification.
  - `permissions` — `['delivery.any.read', 'delivery.any.update']`. Tied to module lifecycle: removing this module removes these keys (enforced by `tests/cross-cutting/module-permissions.test.ts`).
  - `routes` — The Hono/router instance re-exported from `./routes`.
  - `personalData` — Declares a `shipments` section whose `collect` callback resolves the subject's own order IDs via `ownOrderIds` (from `@modules/orders`), then fetches matching shipments via `findShipmentsForOrders` (from `./service`).
  - `locales` — Resolves to the `./locales` directory.

## Relationships

- **`src/kernel/registry.ts`** — Provides the `AppModule` type that this manifest must satisfy.
- **`src/modules.ts`** — Aggregates module manifests (this file is one of the entries it collects).
- **`src/modules/delivery/routes.ts`** — Source of the `router` instance mounted at the module's `basePath`.
- **`src/modules/delivery/service.ts`** — Provides `findShipmentsForOrders`, used in the personal-data collection callback.
- **`src/modules/orders/index.ts`** — Publishes `ownOrderIds`, which this module calls to resolve the subject's order IDs before fetching shipments.

## Notes

- The personal-data `collect` intentionally goes through `ownOrderIds` rather than querying order documents directly; the inline comment calls out that this avoids paging through full order docs and sidesteps the `_id`/`id` normalization trap in `.search()`.
- Permission keys are **module-owned**: a cross-cutting test fails the suite if a key exists in the shared permission file but its declaring module is gone, or vice-versa. Add/remove keys here in lockstep with the shared file.
- The module docblock notes that shipping-rate logic lives in `./domain` as pure functions so the cart's checkout can price a method without touching this module's HTTP surface.
