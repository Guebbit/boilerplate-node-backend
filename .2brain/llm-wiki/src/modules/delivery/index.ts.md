---
source: src/modules/delivery/index.ts
sha256: c881d5531e82765235dce76d77e97b8b32c94443a14f21aa68240981dd8a3975
generated_at: 2026-10-15T10:27:25.581988+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/index.ts

## Purpose

Public barrel for the delivery module. Per the strategic DDD rule (see `docs/theory/strategic-ddd.md` §5), this is the **only** surface a sibling module may import from. It re-exports the module's public API while keeping the two repositories and the models' runtime internals private — no write handle on a collection leaks through here.

## Key elements

- `export * from './services'` — delivery service functions (shipping-method lookup, pricing, `shippedQuantities`, `cancelRemainder`, etc.).
- `export * from './domain'` — pure domain rules; the load-bearing export for pricing consistency between checkout and `/methods` quotes.
- `export * from './events'` — domain event definitions used across the module.
- `export * from './emails'` — delivery-related email templates/composition.
- `export type * from './model'` — type-only re-export of the models (no runtime value escapes).

## Relationships

- **Re-exports (upstream):** `./domain`, `./services`, `./events`, `./emails`, `./model` — all live in the same directory; this file adds no logic, only surface control.
- **`src/modules/cart/services/checkout.ts` (downstream consumer):** calls `findShippingMethod` / `priceShipping` through this barrel so the frozen order total and the `/methods` quote cannot disagree.
- **`src/modules/returns/services/cancel-remainder.ts` & `create.ts` (downstream consumers):** read `shippedQuantities` and call `cancelRemainder` via this barrel to distinguish shipped vs. unshipped line items.
- **`src/modules/notifications/module.ts` (downstream consumer):** consumes the `emails` exports for delivery-related notifications.
- **`scripts/ops/reap-delivery.ts`, `scripts/ops/sweep-preorders.ts` (downstream consumers):** ops scripts that drive delivery lifecycle state through the exported services.

## Notes

- The `export type *` for `./model` is deliberate: model types are available to consumers, but the runtime model internals (and the two repositories) are **not** re-exported. Attempting to import a write-side symbol from here will fail at compile time.
- Because this is the single legal import point for sibling modules, any new cross-module usage must be routed through the appropriate sub-barrel (`./domain`, `./services`, etc.) and added here — direct file-path imports from outside the module violate the DDD rule.
