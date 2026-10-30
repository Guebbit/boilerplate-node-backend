---
source: src/modules/cart/module.ts
sha256: 3297ee2cec142d7ec3d08e964de46107599d46aaac21a584674c232fa2ff2f0e
generated_at: 2026-10-29T03:22:13.971842+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/module.ts

## Purpose

The cart module's manifest entry. It declares how the cart plugs into the application kernel: which routes it mounts, which domain events it subscribes to, what config and rate-limit slices it contributes, what personal-data hooks it exposes, and where its locale files live. It is the single registration point that ties together the cart's internal services, routes, and configuration.

## Key elements

- **Default export (`AppModule`)** — The module manifest object. Declares `name: 'cart'`, mounts the router at `/cart`, contributes `cartConfig.slice` and `cartRateLimits`, defines `personalData` hooks, registers an event subscription, and points to `locales/`.
- **`personalData.collect`** — Returns only `{ productId, quantity }` per line, deliberately excluding joined product name/price (those are catalogue data, and the `CartItem` contract forbids extra properties).
- **`personalData.erase`** — Calls `cartService.deleteByUserId` within the caller's hard-delete transaction (`session` parameter), so the cart rows are removed atomically with the rest of the user's data.
- **`subscribe()`** — Handles `PRODUCT_DELETED` domain events. Before removing the line from carts, it re-checks `productService.isLive(productId)` to avoid a race where a retried delivery arrives after a product restore.

## Relationships

- **`src/kernel/registry.ts`** — Provides the `AppModule` type that the default export satisfies; the module is registered through the kernel's registry.
- **`src/kernel/events.ts`** — Source of `onDomainEvent`, used to subscribe to `PRODUCT_DELETED`.
- **`src/modules/products/index.ts`** — Imported for `PRODUCT_DELETED` and `productService`. The cart reacts to product deletion; products does *not* import the cart (the reverse link is via the domain event, keeping the graph acyclic).
- **`src/modules/cart/routes.ts`** — Provides the `router` that gets mounted at `/cart`.
- **`src/modules/cart/services/index.ts`** — Provides `cartService` used by both personal-data hooks and the event handler.
- **`src/modules/cart/config.ts`** — Provides `cartConfig` (sliced into the manifest's config array).
- **`src/modules/cart/rate-limits.ts`** — Provides `cartRateLimits` registered in the manifest.

## Notes

- The `personalData.erase` hook receives a `session` and joins the caller's existing hard-delete transaction rather than opening its own — do not call `deleteByUserId` elsewhere without passing the shared session.
- `collect` intentionally omits product name/price. If you add fields to the returned object, the `CartItem` OpenAPI contract (`additionalProperties: false`) will reject them.
- The `PRODUCT_DELETED` handler is idempotent-safe: if the product is live again at processing time, the line is left in place. This guards against at-least-once event redelivery after a product restore.
- The file is a `@module` (side-effect-free barrel); it exports no named symbols other than the default manifest.
