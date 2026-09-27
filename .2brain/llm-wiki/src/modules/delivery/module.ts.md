---
source: src/modules/delivery/module.ts
sha256: 450be03e1056e78201c1146faa5df5187d8ca9574f0d66ddc6f5ea04deb1f2fc
generated_at: 2026-09-27T14:50:09.552172+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/module.ts

## Purpose

Module manifest (entry point) for the **delivery** module. It declares the module's identity, HTTP routes, permission keys, personal-data collection entry, and locale path, then exports the whole thing as an `AppModule` so the kernel can register it. The file is a wiring file — no business logic lives here.

## Key elements

- **Default export** — an object `satisfies AppModule` with:
  - `name: 'delivery'`, `basePath: '/delivery'`
  - `permissions` — the three keys this module owns (`delivery.any.read`, `delivery.any.update`, `delivery.any.start`). Removing the module removes these keys (enforced by a cross-cutting test).
  - `routes` — re-exported `router` from `./routes`.
  - `personalData` — a single `shipments` section whose `collect` closure calls `ownOrderIds(userId)` then `findShipmentsForOrders(orderIds)`.
  - `locales` — resolved path to `./locales`.
- **`ownOrderIds`** (imported from `@modules/orders`) — used inside `personalData.collect` to resolve the caller's own order IDs before fetching shipments, avoiding a full-document page-through of orders.

## Relationships

- **`src/kernel/registry.ts`** — provides the `AppModule` type that the default export satisfies; the registry consumes this manifest to mount routes and permissions.
- **`src/modules/orders/index.ts`** — exports `ownOrderIds`, which this file calls to obtain the subject's order IDs without reading full order documents.
- **`src/modules/delivery/routes.ts`** — exports `router`, wired into the manifest's `routes` field.
- **`src/modules/delivery/service.ts`** — exports `findShipmentsForOrders`, called inside the `personalData.collect` closure.
- **`src/modules.ts`** — imports this file's default export as one of the registered app modules.

## Notes

- The design docblock states that shipping-rate logic lives in `./domain` as **pure functions** so the cart/checkout flow can price a method without invoking this module's HTTP layer. Shipping is intentionally *not* an aggregate.
- The `personalData.collect` closure deliberately uses `ownOrderIds` (a thin ID-only query) rather than navigating order `.search()` results, which the inline comment notes has an `_id`/`id` normalization pitfall.
- Permission keys are contractually tied to module existence: `tests/cross-cutting/module-permissions.test.ts` fails if a key is left in the shared file after its module is deleted, or if a module claims a key the file does not attribute to it.
