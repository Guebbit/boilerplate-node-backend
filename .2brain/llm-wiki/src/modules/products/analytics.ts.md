---
source: src/modules/products/analytics.ts
generated_at: 2026-11-22T07:06:49.044492+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/analytics.ts

## Purpose
Declares the analytics event names for the products module (product search and product view) and registers them into the analytics port's app-wide event-name type. These are top-of-funnel discovery events, whose ratio to `CART_ITEM_ADDED` indicates how well the catalogue is working. The browser sends them through `POST /analytics/events`, because the response cache hides most reads from the server.

## Key elements
- `productsAnalyticsEvents`: a `const` object, keyed by intent, mapping to the event-name strings:
  - `PRODUCTS_SEARCHED` → `'products_searched'`
  - `PRODUCT_VIEWED` → `'product_viewed'`
- `declare module '@infrastructure/observability/analytics'`: a module augmentation that adds a `products` entry to `AnalyticsEventMap`. Its type is the union of the values of `productsAnalyticsEvents`.

## Relationships
- Augments `AnalyticsEventMap` from `@infrastructure/observability/analytics`, so these names are accepted by the analytics port. The test at `tests/unit/infrastructure/observability/analytics.test.ts` sits in that area.
- `src/modules/products/browser-events.ts` is a graph neighbor. Per the header comment, the browser is the sender of these events.

## Notes
- `as const` keeps the values as literal types, so the derived union is exactly `'products_searched' | 'product_viewed'`.
- The module has no runtime logic. The `declare module` block affects types only.
- Events come from the browser rather than the server because the response cache hides most reads.
- The header comment says this follows the same pattern as `./audit.ts` (augmenting the port for audit actions) and points to `docs/understand/analytics.md` for details.
